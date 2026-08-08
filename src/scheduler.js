// Real-time Dose Scheduler & Background Notification Service for MedsTrack
// ===========================================================================
// ARCHITECTURE:
// - Native Android: Uses OS-level LocalNotifications with DAILY REPEATING
//   schedule and STABLE deterministic IDs. Listeners are attached exactly ONCE.
//   Action buttons work silently in background (foreground: false) — no app
//   opening or minimizing.
// - Web/Browser: Uses 10-second polling interval with in-app modal.
// ===========================================================================
import { getMedications, getLogsForDate, getTodayString, recordDoseStatus, getMedication } from './db.js';
import { playNotificationSound } from './audio.js';
import { LocalNotifications } from '@capacitor/local-notifications';

let schedulerInterval = null;
const notifiedDosesSet = new Set(); // Tracks format: `${medId}_${dateStr}_${timeStr}`
let nativeListenersAttached = false;
let scheduleDebounceTimer = null;

// ============================================================================
// STABLE NOTIFICATION ID GENERATOR
// ============================================================================
// Produces a deterministic integer from medId + timeStr + dateStr so every
// (medication, dose-time, treatment-day) maps to a UNIQUE, stable ID. Because
// each alarm is a one-shot with its own ID, we can schedule the whole course
// of the treatment without any of them replacing/duplicating another.
// ============================================================================
function getStableNotificationId(medId, timeStr, dateStr = '') {
  const numericMedId = (Number(medId) || 1) & 0xffff;
  const timeParts = String(timeStr).split(':');
  const timeNum = (Number(timeParts[0]) || 0) * 60 + (Number(timeParts[1]) || 0); // 0..1439
  const dayNum = Number(String(dateStr).replace(/\D/g, '')) || 0; // e.g. 20260806
  // Deterministic hash, folded into Android's positive int range.
  let hash = (Math.imul(numericMedId, 1000003) + Math.imul(timeNum, 1009) + dayNum) | 0;
  hash = Math.imul(hash, 31) ^ (hash >>> 4);
  if (hash < 0) hash = -hash;
  return (hash > 0 ? hash : 1) % 1999999999 + 1;
}

// Snooze IDs are offset to avoid collisions with regular dose IDs
function getSnoozeNotificationId(medId, timeStr, dateStr = '') {
  return ((getStableNotificationId(medId, timeStr, dateStr) + 4000000) % 1999999999) + 1;
}

// ============================================================================
// DATE HELPERS (YYYY-MM-DD, timezone-safe)
// ============================================================================
function isoToUtcMs(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}
function addDaysISO(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}
function diffDaysISO(a, b) {
  return Math.round((isoToUtcMs(b) - isoToUtcMs(a)) / 86400000);
}
const ONE_SHOT_MAX_DAYS = 400; // keep the alarm count sane on Android

// ============================================================================
// INIT — Called once on app startup
// ============================================================================
export function initDoseScheduler() {
  // Request Web Notifications permission (for browser fallback)
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission().catch(() => {});
  }

  const isCapacitor = window.Capacitor && window.Capacitor.isNativePlatform();

  if (isCapacitor && !nativeListenersAttached) {
    nativeListenersAttached = true;

    // Attach all native listeners ONCE (never again)
    attachNativeListenersOnce();

    // Listen for medication changes with heavy debounce
    window.addEventListener('medications-updated', () => {
      debouncedReschedule();
    });
  }

  // Initial schedule
  scheduleNativeLocalNotifications();

  // Web-only polling (returns immediately on Capacitor)
  if (schedulerInterval) clearInterval(schedulerInterval);
  checkScheduledDoses();
  schedulerInterval = setInterval(checkScheduledDoses, 10000);
}

// ============================================================================
// DEBOUNCE — Prevents rapid-fire rescheduling from cascading events
// ============================================================================
function debouncedReschedule() {
  if (scheduleDebounceTimer) clearTimeout(scheduleDebounceTimer);
  scheduleDebounceTimer = setTimeout(() => {
    scheduleNativeLocalNotifications();
  }, 3000); // Wait 3 seconds before rescheduling
}

// ============================================================================
// NATIVE LISTENERS — Attached exactly ONCE during app lifetime
// ============================================================================
function attachNativeListenersOnce() {
  // 1. Register action button types — foreground: false means Android
  //    handles the action silently in the background WITHOUT opening the app.
  LocalNotifications.registerActionTypes({
    types: [{
      id: 'MED_ALARM_ACTIONS',
      actions: [
        { id: 'action_take', title: '🟢 Luat', foreground: false },
        { id: 'action_snooze', title: '🟡 Amână 10 min', foreground: false },
        { id: 'action_miss', title: '🔴 Ratat', foreground: false }
      ]
    }]
  }).catch(() => {});

  // 2. When notification appears on screen (app in foreground) — play voice memo
  LocalNotifications.addListener('localNotificationReceived', async (notification) => {
    try {
      const extra = notification.extra || {};
      const soundChoice = extra.soundChoice;
      if (soundChoice && (soundChoice === 'voice' || soundChoice.startsWith('voice_'))) {
        playNotificationSound(soundChoice, 100, 3);
      }
    } catch (err) {
      console.log('Notification received sound note:', err);
    }
  });

  // 3. When user taps an action button on the notification
  //    This runs silently in the background — the app does NOT open.
  //    The action is recorded directly to IndexedDB, notification is dismissed,
  //    and the user stays on their current phone screen.
  LocalNotifications.addListener('localNotificationActionPerformed', async (notificationAction) => {
    try {
      const actionId = notificationAction.actionId;
      const extra = notificationAction.notification.extra || {};
      const medId = extra.medId;
      const timeStr = extra.timeStr;

      if (!medId || !timeStr) return;

      const todayStr = getTodayString();
      const key = `${medId}_${todayStr}_${timeStr}`;

      // Mark as handled to prevent any in-app duplicate
      notifiedDosesSet.add(key);

      const med = await getMedication(medId);

      if (med) {
        if (actionId === 'action_take') {
          // Record directly to database — NO app opening
          await recordDoseStatus(medId, timeStr, todayStr, 'taken');
        } else if (actionId === 'action_snooze') {
          // Schedule a SINGLE one-shot snooze notification in 10 minutes
          await scheduleSnoozeNotification(med, timeStr);
        } else if (actionId === 'action_miss') {
          // Record directly to database — NO app opening
          await recordDoseStatus(medId, timeStr, todayStr, 'missed');
        }
      }

      // Clear all delivered notifications from the tray
      await LocalNotifications.removeAllDelivered().catch(() => {});

      // Silently refresh UI if app happens to be visible (no-op if in background)
      if (window.refreshCurrentView) {
        try { window.refreshCurrentView(); } catch (_) {}
      }

      // NOTE: We do NOT call App.minimizeApp() because foreground:false
      // means Android handles the action without ever opening the activity.
      // The user stays on their phone screen automatically.

    } catch (err) {
      console.log('Action listener error:', err);
    }
  });
}

// ============================================================================
// SCHEDULE A SINGLE SNOOZE NOTIFICATION (one-shot, 10 min from now)
// ============================================================================
async function scheduleSnoozeNotification(med, timeStr) {
  const snoozeDate = new Date(Date.now() + 10 * 60 * 1000);
  const snoozeId = getSnoozeNotificationId(med.id, timeStr);

  // Cancel any previous snooze for this exact dose first
  await LocalNotifications.cancel({ notifications: [{ id: snoozeId }] }).catch(() => {});

  const soundChoice = med.soundChoice || 'bell';
  const soundKey = soundChoice.toLowerCase().replace(/[^a-z0-9]/g, '');
  const isVoice = soundKey.startsWith('voice');

  await LocalNotifications.schedule({
    notifications: [{
      title: `⏰ AMÂNAT: ${med.name}`,
      body: `⏰ Ora ${timeStr} • Doză: ${med.dosageDisplay || '1 comprimat'}`,
      id: snoozeId,
      schedule: {
        at: snoozeDate,
        allowWhileIdle: true
        // NO repeats — fires exactly once for snooze
      },
      channelId: isVoice ? 'medstrack_channel_bell' : `medstrack_channel_${soundKey}`,
      sound: isVoice ? 'bell.wav' : `${soundKey}.wav`,
      smallIcon: 'ic_notification',
      iconColor: '#0052b4',
      actionTypeId: 'MED_ALARM_ACTIONS',
      extra: { medId: med.id, timeStr, soundChoice }
    }]
  }).catch(() => {});
}

// ============================================================================
// MAIN SCHEDULING FUNCTION — Schedules all dose notifications
// ============================================================================
// Called on:
//   - App startup (initDoseScheduler)
//   - After medication is added/edited/deleted (debounced medications-updated)
//
// Strategy:
//   1. Cancel ALL currently pending notifications (clean slate)
//   2. For each medication + time:
//      a. Compute the NEXT fire date (today if not yet passed, otherwise tomorrow)
//      b. Schedule with repeats:true + every:'day' so it fires DAILY automatically
//      c. The daily repeat is managed entirely by Android AlarmManager
//   3. Uses STABLE deterministic IDs — same dose = same ID = proper cancellation
// ============================================================================
export async function scheduleNativeLocalNotifications() {
  try {
    const isCapacitor = window.Capacitor && window.Capacitor.isNativePlatform();
    if (!isCapacitor) return;

    const perm = await LocalNotifications.requestPermissions();
    if (perm.display !== 'granted') return;

    // Ensure default bell channel exists (used as fallback for voice memos)
    await LocalNotifications.createChannel({
      id: 'medstrack_channel_bell',
      name: 'Alerte Medicament',
      description: 'Notificări prioritare pentru administrarea medicamentelor',
      importance: 5,
      visibility: 1,
      sound: 'bell.wav',
      vibration: true,
      lights: true,
      lightColor: '#0052b4'
    }).catch(() => {});

    const medications = await getMedications();
    const todayStr = getTodayString();

    // 1. Cancel ALL pending notifications for a clean slate
    const pending = await LocalNotifications.getPending().catch(() => ({ notifications: [] }));
    if (pending && pending.notifications && pending.notifications.length > 0) {
      await LocalNotifications.cancel(pending).catch(() => {});
    }

    const notificationsToSchedule = [];
    // Android holds a limited number of pending alarms per app (frequently ~500
    // on several OEMs). We budget the one-shot alarms across ALL meds so a big
    // multi-medication setup can never overflow the alarm queue; once the
    // budget is spent, the remaining (med, time) entries fall back to a single
    // daily repeating alarm, which still fires every day until the course ends.
    let oneShotBudget = 450;

    for (const med of medications) {
      if (!med.times || !Array.isArray(med.times)) continue;

      // =========================================================================
      // Compute the treatment window [dayStartISO .. dayEndISO] (inclusive).
      //   - startDate + durationDays bound the course (e.g. 2026-08-06 + 7 days).
      //   - If the course already ended, skip (NO infinite notifications).
      //   - If the course is still in the future, start at its start date.
      // =========================================================================
      let dayStartISO = null;
      let dayEndISO = null;
      let hasWindow = false;

      if (med.startDate && Number(med.durationDays) > 0) {
        const startISO = med.startDate;
        dayEndISO = addDaysISO(startISO, Number(med.durationDays) - 1);
        hasWindow = true;

        // Already finished before today? Do not notify.
        if (dayEndISO < todayStr) continue;

        // Notify from today (if the course already began) or from the course start.
        dayStartISO = todayStr > startISO ? todayStr : startISO;
      }

      // Build notification title
      let title = `💊 ${med.name}`;
      if (med.treatmentCategory && med.treatmentCategory.trim() !== '' &&
          med.treatmentCategory.toLowerCase() !== med.name.toLowerCase() &&
          med.treatmentCategory.toLowerCase() !== 'general') {
        title = `💊 [${med.treatmentCategory}] ${med.name}`;
      }

      // Determine sound & channel
      const soundChoice = med.soundChoice || 'bell';
      const soundKey = soundChoice.toLowerCase().replace(/[^a-z0-9]/g, '');
      const isVoice = soundKey.startsWith('voice');
      const channelId = isVoice ? 'medstrack_channel_bell' : `medstrack_channel_${soundKey}`;
      const channelSound = isVoice ? 'bell.wav' : `${soundKey}.wav`;

      // Create sound channel (if not voice — voice uses bell channel)
      if (!isVoice) {
        await LocalNotifications.createChannel({
          id: channelId,
          name: `Alerte ${soundKey}`,
          description: 'Notificări prioritare pentru administrarea medicamentelor',
          importance: 5,
          visibility: 1,
          sound: channelSound,
          vibration: true,
          lights: true,
          lightColor: '#0052b4'
        }).catch(() => {});
      }

      const isUnlim = med.isUnlimited || med.totalStock === 'unlimited';
      const dosageTxt = med.dosageDisplay || '1 comprimat';

      for (let tIdx = 0; tIdx < med.times.length; tIdx++) {
        const timeStr = med.times[tIdx];
        if (!timeStr) continue;

        const bodyText = isUnlim
          ? `⏰ Ora ${timeStr} • Doză: ${dosageTxt}`
          : `⏰ Ora ${timeStr} • Doză: ${dosageTxt} (${med.remainingStock !== undefined ? med.remainingStock : (med.totalStock || 20)} doze)`;

        if (hasWindow) {
          // =====================================================================
          // BOUNDED TREATMENT — schedule an EXACT one-shot alarm for EVERY day.
          // One notification per (day, time) with a unique stable ID, so the
          // whole course fires at the exact hours the user defined, and it keeps
          // working while the app is closed (the OS owns the alarms).
          //
          // We also respect a global one-shot budget so a large multi-med setup
          // can never overflow Android's per-app pending-alarm limit; once the
          // budget would be exceeded we fall back to a single daily repeating
          // alarm for that (med, time), which still covers every remaining day.
          // =====================================================================
          const numDays = diffDaysISO(dayStartISO, dayEndISO) + 1;
          const useOneShot = numDays <= ONE_SHOT_MAX_DAYS && numDays <= oneShotBudget;

          if (useOneShot) {
            oneShotBudget -= numDays;
            for (let i = 0; i < numDays; i++) {
              const dayISO = addDaysISO(dayStartISO, i);
              const fireDate = new Date(`${dayISO}T${timeStr}:00`);
              // Skip a time that already passed today (e.g. when starting mid-day).
              if (fireDate.getTime() <= Date.now()) continue;
              notificationsToSchedule.push({
                title,
                body: bodyText,
                id: getStableNotificationId(med.id, timeStr, dayISO),
                schedule: { at: fireDate, allowWhileIdle: true }, // exact one-shot
                channelId,
                sound: channelSound,
                smallIcon: 'ic_notification',
                iconColor: '#0052b4',
                actionTypeId: 'MED_ALARM_ACTIONS',
                extra: { medId: med.id, timeStr, day: dayISO, soundChoice }
              });
            }
          } else {
            // Very long course or budget exhausted: fall back to a single daily
            // repeating alarm that still fires every day until the course ends.
            const [hours, minutes] = timeStr.split(':').map(Number);
            const scheduleDate = new Date();
            scheduleDate.setHours(hours, minutes, 0, 0);
            if (scheduleDate.getTime() <= Date.now()) {
              scheduleDate.setDate(scheduleDate.getDate() + 1);
            }
            notificationsToSchedule.push({
              title,
              body: bodyText,
              id: getStableNotificationId(med.id, timeStr),
              schedule: { at: scheduleDate, repeats: true, every: 'day', allowWhileIdle: true },
              channelId,
              sound: channelSound,
              smallIcon: 'ic_notification',
              iconColor: '#0052b4',
              actionTypeId: 'MED_ALARM_ACTIONS',
              extra: { medId: med.id, timeStr, soundChoice }
            });
          }
        } else {
          // No duration window: a never-ending daily repeating reminder.
          const [hours, minutes] = timeStr.split(':').map(Number);
          const scheduleDate = new Date();
          scheduleDate.setHours(hours, minutes, 0, 0);
          if (scheduleDate.getTime() <= Date.now()) {
            scheduleDate.setDate(scheduleDate.getDate() + 1);
          }
          notificationsToSchedule.push({
            title,
            body: bodyText,
            id: getStableNotificationId(med.id, timeStr),
            schedule: { at: scheduleDate, repeats: true, every: 'day', allowWhileIdle: true },
            channelId,
            sound: channelSound,
            smallIcon: 'ic_notification',
            iconColor: '#0052b4',
            actionTypeId: 'MED_ALARM_ACTIONS',
            extra: { medId: med.id, timeStr, soundChoice }
          });
        }
      }
    }

    if (notificationsToSchedule.length > 0) {
      await LocalNotifications.schedule({ notifications: notificationsToSchedule }).catch(err => {
        console.log('LocalNotifications schedule note:', err);
      });
    }
  } catch (err) {
    console.log('LocalNotifications init note:', err);
  }
}

// ============================================================================
// WEB-ONLY: 10-second polling for in-app notifications (browser preview)
// Returns immediately on native Android.
// ============================================================================
export async function checkScheduledDoses() {
  try {
    const isCapacitor = window.Capacitor && window.Capacitor.isNativePlatform();
    if (isCapacitor) return; // Native Android uses OS-level notifications exclusively

    const now = new Date();
    const currentHH = String(now.getHours()).padStart(2, '0');
    const currentMM = String(now.getMinutes()).padStart(2, '0');
    const currentTimeStr = `${currentHH}:${currentMM}`;
    const todayStr = getTodayString();

    const medications = await getMedications();
    const todayLogs = await getLogsForDate(todayStr);

    for (const med of medications) {
      if (!med.times || !Array.isArray(med.times) || med.times.length === 0) {
        continue;
      }

      if (med.startDate && med.durationDays) {
        const start = new Date(med.startDate);
        const todayDate = new Date(todayStr);
        const diffTime = todayDate.getTime() - start.getTime();
        const diffDays = Math.floor(diffTime / (1000 * 3600 * 24));

        if (diffDays < 0 || diffDays >= med.durationDays) {
          continue;
        }
      }

      for (const timeStr of med.times) {
        if (!timeStr) continue;

        const key = `${med.id}_${todayStr}_${timeStr}`;

        if (timeStr === currentTimeStr) {
          const isLogged = todayLogs.some(l => l.medicationId === med.id && l.scheduledTime === timeStr);

          if (isLogged || notifiedDosesSet.has(key)) {
            continue;
          }

          notifiedDosesSet.add(key);

          playNotificationSound(med.soundChoice || 'bell', med.criticalAlert ? 100 : 80, 3);
          sendWebNotification(med, timeStr);
          displayInAppDoseModal(med, timeStr);
        }
      }
    }
  } catch (error) {
    console.error('Error during scheduled doses check:', error);
  }
}

// ============================================================================
// WEB-ONLY HELPERS (browser preview)
// ============================================================================

function sendWebNotification(med, timeStr) {
  if (!('Notification' in window)) return;

  const categoryPart = med.treatmentCategory ? `[${med.treatmentCategory}] ` : '';
  const title = `💊 ${categoryPart}${med.name}`;

  const isUnlim = med.isUnlimited || med.totalStock === 'unlimited';
  const bodyText = isUnlim
    ? `⏰ Ora ${timeStr} • Doză: ${med.dosageDisplay || '1 comprimat'}`
    : `⏰ Ora ${timeStr} • Doză: ${med.dosageDisplay || '1 comprimat'}\n📋 Stoc: ${med.remainingStock !== undefined ? med.remainingStock : (med.totalStock || 20)} doze`;

  const options = {
    body: bodyText,
    icon: '/manifest.json',
    tag: `dose_${med.id}_${todayStringClean(timeStr)}`,
    renotify: true,
    requireInteraction: true,
    actions: [
      { action: 'take', title: ' Luat' },
      { action: 'snooze', title: ' Amână 10 min' },
      { action: 'miss', title: ' Ratat' }
    ]
  };

  if (Notification.permission === 'granted') {
    if ('serviceWorker' in navigator && navigator.serviceWorker.ready) {
      navigator.serviceWorker.ready.then(reg => {
        reg.showNotification(title, options).catch(() => {
          new Notification(title, options);
        });
      }).catch(() => {
        new Notification(title, options);
      });
    } else {
      new Notification(title, options);
    }
  }
}

function todayStringClean(timeStr) {
  return `${getTodayString()}_${timeStr.replace(':', '')}`;
}

export function snoozeDose(med, timeStr) {
  showToast(`Notificarea pentru ${med.name} (${timeStr}) a fost amânată cu 10 minute.`);

  setTimeout(() => {
    playNotificationSound(med.soundChoice || 'bell', med.criticalAlert ? 100 : 80, 3);
    sendWebNotification(med, timeStr);
    displayInAppDoseModal(med, timeStr);
  }, 10 * 60 * 1000);
}

export function displayInAppDoseModal(med, timeStr) {
  const existing = document.getElementById('dose-alarm-modal');
  if (existing) {
    existing.remove();
  }

  const isUnlim = med.isUnlimited || med.totalStock === 'unlimited';

  const modal = document.createElement('div');
  modal.id = 'dose-alarm-modal';
  modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-300';
  modal.innerHTML = `
    <div class="bg-surface-container-lowest w-full max-w-sm rounded-3xl p-6 shadow-2xl border-2 border-primary/50 text-center space-y-4 animate-in zoom-in-95 duration-200">
      
      <!-- Icon & Alarm Header Badge -->
      <div class="w-16 h-16 bg-primary-fixed rounded-full flex items-center justify-center text-primary mx-auto animate-bounce shadow-md">
        <span class="material-symbols-outlined text-4xl">notifications_active</span>
      </div>

      <div class="space-y-1">
        ${med.treatmentCategory ? `
          <span class="inline-block px-3 py-1 bg-secondary-container text-on-secondary-container font-extrabold text-xs rounded-full uppercase tracking-wider mb-1">
            Tratament: ${med.treatmentCategory}
          </span>
        ` : `
          <span class="inline-block px-3 py-1 bg-primary-fixed text-primary font-bold text-xs rounded-full mb-1">
            Memento Administrare
          </span>
        `}

        <h2 class="text-2xl font-black text-on-surface leading-tight">${med.name}</h2>
        <p class="text-xs text-outline font-medium">Ora programată: <strong class="text-primary">${timeStr}</strong></p>
      </div>

      <!-- Detailed Info Box -->
      <div class="bg-surface-container-low p-3.5 rounded-2xl border border-outline-variant/30 space-y-1.5 text-xs text-left">
        <div class="flex justify-between items-start">
          <span class="text-outline font-medium">Medicație / Doză:</span>
          <span class="font-bold text-primary text-sm text-right">${med.dosageDisplay || '1 comprimat'}</span>
        </div>
        ${!isUnlim ? `
          <div class="flex justify-between items-center pt-1.5 border-t border-outline-variant/20">
            <span class="text-outline font-medium">Stoc disponibil:</span>
            <span class="font-bold text-on-surface">${med.remainingStock !== undefined ? med.remainingStock : (med.totalStock || 20)} doze</span>
          </div>
        ` : ''}
      </div>

      <!-- 3 Action Buttons -->
      <div class="pt-1 flex flex-col gap-2.5">
        <button id="btn-modal-take-dose" class="w-full h-12 bg-primary text-on-primary font-bold rounded-2xl shadow-lg hover:bg-primary-container active:scale-95 transition-all flex items-center justify-center gap-2 text-sm">
          <span class="material-symbols-outlined text-xl">check_circle</span>
          <span>Luat</span>
        </button>

        <button id="btn-modal-snooze-dose" class="w-full h-11 bg-secondary-container text-on-secondary-container font-bold rounded-2xl border border-secondary/30 hover:bg-secondary-fixed active:scale-95 transition-all flex items-center justify-center gap-2 text-sm">
          <span class="material-symbols-outlined text-lg">schedule</span>
          <span>Amână 10 minute</span>
        </button>

        <button id="btn-modal-miss-dose" class="w-full h-11 bg-error-container/60 text-error font-bold rounded-2xl border border-error/30 hover:bg-error-container active:scale-95 transition-all flex items-center justify-center gap-2 text-sm">
          <span class="material-symbols-outlined text-lg">cancel</span>
          <span>Ratat</span>
        </button>
      </div>

    </div>
  `;

  document.body.appendChild(modal);

  // 1. Action LUAT
  modal.querySelector('#btn-modal-take-dose').addEventListener('click', async () => {
    await recordDoseStatus(med.id, timeStr, getTodayString(), 'taken');
    modal.remove();
    const isUnlim2 = med.isUnlimited || med.totalStock === 'unlimited';
    const toastMsg = isUnlim2
      ? `Doza de ${med.name} a fost marcată ca Luată.`
      : `Doza de ${med.name} a fost marcată ca Luată. Stocul s-a actualizat.`;
    showToast(toastMsg);
    if (window.refreshCurrentView) {
      window.refreshCurrentView();
    }
  });

  // 2. Action AMÂNĂ 10 MIN
  modal.querySelector('#btn-modal-snooze-dose').addEventListener('click', () => {
    modal.remove();
    snoozeDose(med, timeStr);
  });

  // 3. Action RATAT
  modal.querySelector('#btn-modal-miss-dose').addEventListener('click', async () => {
    await recordDoseStatus(med.id, timeStr, getTodayString(), 'missed');
    modal.remove();
    showToast(`Doza de ${med.name} a fost marcată ca Ratată.`);
    if (window.refreshCurrentView) {
      window.refreshCurrentView();
    }
  });
}
