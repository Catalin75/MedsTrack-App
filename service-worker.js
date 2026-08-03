const CACHE_NAME = 'medstrack-cache-v5';
const DB_NAME = 'medstrack_db_v3';
const DB_VERSION = 1;

const ASSETS = [
  './',
  './index.html',
  './src/main.js',
  './src/scheduler.js',
  './src/db.js',
  './src/audio.js',
  './src/views/dashboard.js',
  './src/views/addMedication.js',
  './src/views/cabinet.js',
  './src/views/notifications.js',
  './src/views/history.js'
];

// ─── Install & Activate ───

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then(res => res || fetch(e.request))
  );
});

// ─── IndexedDB helpers (standalone, no ES module imports in SW) ───

function swOpenDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

function swGetLogsForDate(db, dateStr) {
  return new Promise((resolve) => {
    const tx = db.transaction('logs', 'readonly');
    const index = tx.objectStore('logs').index('date');
    const req = index.getAll(dateStr);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => resolve([]);
  });
}

function swGetTodayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Records a dose status (taken / missed) directly in IndexedDB from the Service Worker.
 * This mirrors the logic of recordDoseStatus in db.js so the app doesn't need to open.
 */
async function swRecordDoseStatus(medId, scheduledTime, dateStr, status) {
  const db = await swOpenDB();
  const numMedId = Number(medId);

  // 1. Read existing logs for this date
  const logs = await swGetLogsForDate(db, dateStr);
  const existingLog = logs.find(
    l => Number(l.medicationId) === numMedId && l.scheduledTime === scheduledTime
  );

  // 2. Open a readwrite transaction on both stores
  const tx = db.transaction(['logs', 'medications'], 'readwrite');
  const logStore = tx.objectStore('logs');
  const medStore = tx.objectStore('medications');

  return new Promise((resolve) => {
    const medReq = medStore.get(numMedId);
    medReq.onsuccess = () => {
      const med = medReq.result;
      const isUnlimited = med && (med.isUnlimited || med.totalStock === 'unlimited');

      // Revert stock if previous log was "taken"
      if (existingLog) {
        logStore.delete(existingLog.id);
        if (existingLog.taken && med && !isUnlimited) {
          const cur = typeof med.remainingStock === 'number'
            ? med.remainingStock
            : parseInt(med.remainingStock ?? med.totalStock ?? 20, 10);
          med.remainingStock = (isNaN(cur) ? 20 : cur) + 1;
          medStore.put(med);
        }
      }

      if (status === 'taken') {
        logStore.add({
          medicationId: numMedId,
          scheduledTime,
          date: dateStr,
          status: 'taken',
          taken: true,
          missed: false,
          takenAt: new Date().toISOString()
        });
        if (med && !isUnlimited) {
          const cur = typeof med.remainingStock === 'number'
            ? med.remainingStock
            : parseInt(med.remainingStock ?? med.totalStock ?? 20, 10);
          const valid = isNaN(cur) ? 20 : cur;
          if (valid > 0) {
            med.remainingStock = valid - 1;
            medStore.put(med);
          }
        }
      } else if (status === 'missed') {
        logStore.add({
          medicationId: numMedId,
          scheduledTime,
          date: dateStr,
          status: 'missed',
          taken: false,
          missed: true,
          recordedAt: new Date().toISOString()
        });
        // Stock stays unchanged for missed doses
      }

      tx.oncomplete = () => resolve(status);
      tx.onerror = () => resolve(status);
    };
    medReq.onerror = () => resolve(status);
  });
}

/**
 * Stores a snooze request in IndexedDB (settings store, key = 'pending_snoozes').
 * The main-thread scheduler will pick it up and re-send the notification when due.
 */
async function swStoreSnooze(notifData) {
  const db = await swOpenDB();
  const tx = db.transaction('settings', 'readwrite');
  const store = tx.objectStore('settings');

  return new Promise((resolve) => {
    const req = store.get('pending_snoozes');
    req.onsuccess = () => {
      const record = req.result || { key: 'pending_snoozes', snoozes: [] };
      record.snoozes.push({
        medId: notifData.medId,
        medName: notifData.medName,
        timeStr: notifData.timeStr,
        dateStr: notifData.dateStr,
        soundChoice: notifData.soundChoice,
        criticalAlert: notifData.criticalAlert,
        dosageDisplay: notifData.dosageDisplay,
        snoozeUntil: Date.now() + 10 * 60 * 1000 // 10 minutes from now
      });
      store.put(record);
      tx.oncomplete = () => resolve();
    };
    req.onerror = () => resolve();
  });
}

/**
 * Sends a message to all open app windows so they can refresh their UI.
 */
async function swNotifyClients(message) {
  const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  clientList.forEach(client => client.postMessage(message));
}

// ─── Notification Click Handler ───
// Processes the user's choice WITHOUT opening the app.

self.addEventListener('notificationclick', (event) => {
  const action = event.action;
  const data = event.notification.data || {};

  event.notification.close();

  const { medId, timeStr, dateStr } = data;
  if (!medId || !timeStr) return;

  const effectiveDateStr = dateStr || swGetTodayString();

  if (action === 'take') {
    // Record as taken, reduce stock, refresh open app if any
    event.waitUntil(
      swRecordDoseStatus(medId, timeStr, effectiveDateStr, 'taken')
        .then(() => swNotifyClients({ type: 'REFRESH_VIEW' }))
    );
  } else if (action === 'miss') {
    // Record as missed (stock unchanged), refresh open app if any
    event.waitUntil(
      swRecordDoseStatus(medId, timeStr, effectiveDateStr, 'missed')
        .then(() => swNotifyClients({ type: 'REFRESH_VIEW' }))
    );
  } else if (action === 'snooze') {
    // Store snooze in DB — the app scheduler will re-trigger in 10 min
    event.waitUntil(
      swStoreSnooze(data)
        .then(() => swNotifyClients({ type: 'SNOOZE_STORED' }))
    );
  }
  // If user taps notification body (no specific action), just close it — no app opening.
});

// Notification dismissed without any action — dose stays "În așteptare"
self.addEventListener('notificationclose', () => {});
