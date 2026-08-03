// Real-time Dose Scheduler & Notification Service for MedsTrack
// Only sends native system notifications (no in-app modal).
import { getMedications, getLogsForDate, getTodayString, getPendingSnoozes, savePendingSnoozes } from './db.js';
import { playNotificationSound } from './audio.js';

let schedulerInterval = null;
const notifiedDosesSet = new Set(); // Key format: `${medId}_${dateStr}_${timeStr}`
let lastCheckedDate = '';

/**
 * Initializes the background scheduler and requests notification permissions.
 */
export function initDoseScheduler() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission().catch(err => {
      console.log('Notification permission request note:', err);
    });
  }

  if (schedulerInterval) {
    clearInterval(schedulerInterval);
  }

  lastCheckedDate = getTodayString();
  checkScheduledDoses();
  schedulerInterval = setInterval(checkScheduledDoses, 10000);
}

/**
 * Checks all active medications against current time, triggers notifications,
 * and processes pending snooze reminders.
 */
export async function checkScheduledDoses() {
  try {
    const now = new Date();
    const currentHH = String(now.getHours()).padStart(2, '0');
    const currentMM = String(now.getMinutes()).padStart(2, '0');
    const currentTimeStr = `${currentHH}:${currentMM}`;
    const todayStr = getTodayString();

    // Clear notified set when date changes (new day = fresh notifications)
    if (lastCheckedDate !== todayStr) {
      notifiedDosesSet.clear();
      lastCheckedDate = todayStr;
    }

    const medications = await getMedications();
    const todayLogs = await getLogsForDate(todayStr);

    for (const med of medications) {
      if (!med.times || !Array.isArray(med.times) || med.times.length === 0) {
        continue;
      }

      // Verify treatment date range
      if (med.startDate && med.durationDays) {
        const start = new Date(med.startDate);
        const todayDate = new Date(todayStr);
        const diffTime = todayDate.getTime() - start.getTime();
        const diffDays = Math.floor(diffTime / (1000 * 3600 * 24));

        if (diffDays < 0 || diffDays >= med.durationDays) {
          continue; // Medication is not active today
        }
      }

      for (const timeStr of med.times) {
        if (!timeStr) continue;

        const key = `${med.id}_${todayStr}_${timeStr}`;

        if (timeStr === currentTimeStr) {
          // Check if dose was already logged (taken OR missed)
          const isLogged = todayLogs.some(
            l => Number(l.medicationId) === Number(med.id) && l.scheduledTime === timeStr
          );

          if (isLogged || notifiedDosesSet.has(key)) {
            continue;
          }

          notifiedDosesSet.add(key);

          // Play the sound configured for this medication
          playNotificationSound(med.soundChoice || 'bell', med.criticalAlert ? 100 : 80);

          // Send system notification with 3 action buttons
          sendWebNotification(med, timeStr, todayStr);
        }
      }
    }

    // Check pending snoozes
    await checkPendingSnoozes(medications);

  } catch (error) {
    console.error('Error during scheduled doses check:', error);
  }
}

/**
 * Sends a native system notification with action buttons.
 * On Android PWA these render as the notification the user sees on lock screen.
 */
function sendWebNotification(med, timeStr, dateStr, isSnoozeReminder = false) {
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  const title = `💊 ${med.name}`;
  const body = `⏰ Ora ${timeStr} • Doză: ${med.dosageDisplay || '1 doză'}${med.mealReminder ? ' • Înainte de masă' : ''}${isSnoozeReminder ? ' (Reamintire)' : ''}`;

  const options = {
    body,
    tag: `dose_${med.id}_${dateStr}_${timeStr.replace(':', '')}${isSnoozeReminder ? '_snz' : ''}`,
    renotify: true,
    requireInteraction: true,
    data: {
      medId: med.id,
      medName: med.name,
      timeStr,
      dateStr,
      soundChoice: med.soundChoice || 'bell',
      criticalAlert: med.criticalAlert || false,
      dosageDisplay: med.dosageDisplay || '1 doză',
      mealReminder: med.mealReminder || false
    },
    actions: [
      { action: 'take', title: '🟢 LUAT' },
      { action: 'snooze', title: '🟡 AMÂNĂ 10 MIN' },
      { action: 'miss', title: '🔴 RATAT' }
    ]
  };

  if ('serviceWorker' in navigator && navigator.serviceWorker.ready) {
    navigator.serviceWorker.ready.then(reg => {
      reg.showNotification(title, options).catch(() => {
        try { new Notification(title, options); } catch (e) { /* fallback failed */ }
      });
    }).catch(() => {
      try { new Notification(title, options); } catch (e) { /* fallback failed */ }
    });
  } else {
    try { new Notification(title, options); } catch (e) { /* not supported */ }
  }
}

/**
 * Checks IndexedDB for pending snooze reminders and re-triggers notifications
 * when the snooze duration has expired.
 */
async function checkPendingSnoozes(medications) {
  try {
    const snoozes = await getPendingSnoozes();
    if (!snoozes || snoozes.length === 0) return;

    const now = Date.now();
    const dueSnoozes = snoozes.filter(s => now >= s.snoozeUntil);
    const remainingSnoozes = snoozes.filter(s => now < s.snoozeUntil);

    if (dueSnoozes.length > 0) {
      await savePendingSnoozes(remainingSnoozes);

      for (const snooze of dueSnoozes) {
        // Find the full medication object to get sound settings
        const med = medications.find(m => Number(m.id) === Number(snooze.medId));
        const medObj = med || {
          id: snooze.medId,
          name: snooze.medName || 'Medicament',
          soundChoice: snooze.soundChoice || 'bell',
          criticalAlert: snooze.criticalAlert || false,
          dosageDisplay: snooze.dosageDisplay || '1 doză',
          mealReminder: false
        };

        // Play the medication's configured sound
        playNotificationSound(medObj.soundChoice || 'bell', medObj.criticalAlert ? 100 : 80);

        // Re-send the notification
        sendWebNotification(medObj, snooze.timeStr, snooze.dateStr, true);
      }
    }
  } catch (err) {
    console.log('Snooze check note:', err);
  }
}
