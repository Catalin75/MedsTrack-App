// IndexedDB Layer for MedsTrack App
const DB_NAME = 'medstrack_db_v3';
const DB_VERSION = 1;

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (e) => {
      const db = e.target.result;

      if (db.objectStoreNames.contains('medications')) {
        db.deleteObjectStore('medications');
      }
      if (db.objectStoreNames.contains('logs')) {
        db.deleteObjectStore('logs');
      }
      if (db.objectStoreNames.contains('voiceMemos')) {
        db.deleteObjectStore('voiceMemos');
      }
      if (db.objectStoreNames.contains('settings')) {
        db.deleteObjectStore('settings');
      }

      const medStore = db.createObjectStore('medications', { keyPath: 'id', autoIncrement: true });
      medStore.createIndex('name', 'name', { unique: false });

      const logStore = db.createObjectStore('logs', { keyPath: 'id', autoIncrement: true });
      logStore.createIndex('date', 'date', { unique: false });
      logStore.createIndex('medDate', ['medicationId', 'date'], { unique: false });

      db.createObjectStore('voiceMemos', { keyPath: 'id', autoIncrement: true });
      db.createObjectStore('settings', { keyPath: 'key' });
    };

    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });

  return dbPromise;
}

export async function initSeedData() {
  const db = await openDB();

  if (indexedDB.databases) {
    try {
      const dbs = await indexedDB.databases();
      for (const d of dbs) {
        if (d.name && d.name !== DB_NAME && d.name.startsWith('medstrack_db')) {
          indexedDB.deleteDatabase(d.name);
        }
      }
    } catch (err) {
      console.log('Legacy cleanup note:', err);
    }
  }

  const tx = db.transaction(['settings'], 'readonly');
  const settingsStore = tx.objectStore('settings');
  const req = settingsStore.get('app');

  req.onsuccess = async () => {
    if (!req.result) {
      const writeTx = db.transaction(['settings'], 'readwrite');
      const settingsWrite = writeTx.objectStore('settings');
      settingsWrite.put({ key: 'app', vibration: true, criticalAlerts: false, volume: 75, soundChoice: 'bell' });
    }
  };
}

export async function clearAllData() {
  const db = await openDB();
  const tx = db.transaction(['medications', 'logs', 'voiceMemos'], 'readwrite');
  tx.objectStore('medications').clear();
  tx.objectStore('logs').clear();
  tx.objectStore('voiceMemos').clear();
}

export function getTodayString() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export async function getMedications() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('medications', 'readonly');
    const store = tx.objectStore('medications');
    const request = store.getAll();
    request.onsuccess = () => {
      const results = request.result || [];
      const normalized = results.map(med => {
        const isUnlim = med.isUnlimited || med.totalStock === 'unlimited';
        if (!isUnlim && (med.remainingStock === undefined || med.remainingStock === null)) {
          const tot = typeof med.totalStock === 'number' ? med.totalStock : parseInt(med.totalStock || 20, 10);
          med.remainingStock = isNaN(tot) ? 20 : tot;
        }
        return med;
      });
      resolve(normalized);
    };
    request.onerror = (e) => reject(e.target.error);
  });
}

export async function getMedication(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('medications', 'readonly');
    const store = tx.objectStore('medications');
    const request = store.get(Number(id));
    request.onsuccess = () => resolve(request.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

export async function saveMedication(med) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('medications', 'readwrite');
    const store = tx.objectStore('medications');
    const request = store.put(med);
    request.onsuccess = () => resolve(request.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

export async function deleteMedication(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('medications', 'readwrite');
    const store = tx.objectStore('medications');
    const request = store.delete(Number(id));
    request.onsuccess = () => resolve();
    request.onerror = (e) => reject(e.target.error);
  });
}

export async function getLogsForDate(dateStr) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('logs', 'readonly');
    const store = tx.objectStore('logs');
    const index = store.index('date');
    const request = index.getAll(dateStr);
    request.onsuccess = () => resolve(request.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

export async function toggleDoseLog(medicationId, scheduledTime, dateStr) {
  const db = await openDB();
  const numMedId = Number(medicationId);
  const logs = await getLogsForDate(dateStr);
  const existingLog = logs.find(l => Number(l.medicationId) === numMedId && l.scheduledTime === scheduledTime);

  const tx = db.transaction(['logs', 'medications'], 'readwrite');
  const logStore = tx.objectStore('logs');
  const medStore = tx.objectStore('medications');

  const medReq = medStore.get(numMedId);

  return new Promise((resolve) => {
    medReq.onsuccess = () => {
      const med = medReq.result;
      const isUnlimited = med && (med.isUnlimited || med.totalStock === 'unlimited');

      if (existingLog) {
        logStore.delete(existingLog.id);
        if (med && !isUnlimited) {
          const currentRem = typeof med.remainingStock === 'number'
            ? med.remainingStock
            : parseInt(med.remainingStock !== undefined ? med.remainingStock : (med.totalStock || 20), 10);
          med.remainingStock = (isNaN(currentRem) ? 20 : currentRem) + 1;
          medStore.put(med);
        }
        resolve({ taken: false, remainingStock: med ? med.remainingStock : 0 });
      } else {
        logStore.add({
          medicationId: numMedId,
          scheduledTime,
          date: dateStr,
          taken: true,
          takenAt: new Date().toISOString()
        });
        if (med && !isUnlimited) {
          const currentRem = typeof med.remainingStock === 'number'
            ? med.remainingStock
            : parseInt(med.remainingStock !== undefined ? med.remainingStock : (med.totalStock || 20), 10);
          const validRem = isNaN(currentRem) ? 20 : currentRem;
          if (validRem > 0) {
            med.remainingStock = validRem - 1;
            medStore.put(med);
          }
        }
        resolve({ taken: true, remainingStock: med ? med.remainingStock : 0 });
      }
    };
  });
}

export async function saveVoiceMemo(blob, durationSeconds) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('voiceMemos', 'readwrite');
    const store = tx.objectStore('voiceMemos');
    const item = {
      blob,
      durationSeconds,
      createdAt: new Date().toISOString()
    };
    const request = store.add(item);
    request.onsuccess = () => resolve(request.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

export async function getVoiceMemos() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('voiceMemos', 'readonly');
    const store = tx.objectStore('voiceMemos');
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

export async function getVoiceMemo(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('voiceMemos', 'readonly');
    const store = tx.objectStore('voiceMemos');
    const request = store.get(Number(id));
    request.onsuccess = () => resolve(request.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

export async function getSettings() {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction('settings', 'readonly');
    const store = tx.objectStore('settings');
    const request = store.get('app');
    request.onsuccess = () => {
      resolve(request.result || { key: 'app', vibration: true, criticalAlerts: false, volume: 75, soundChoice: 'bell' });
    };
  });
}

export async function saveSettings(settings) {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction('settings', 'readwrite');
    const store = tx.objectStore('settings');
    store.put({ key: 'app', ...settings });
    tx.oncomplete = () => resolve();
  });
}
