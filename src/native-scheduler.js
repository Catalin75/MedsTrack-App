import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { recordDoseStatus, getTodayString, getMedications } from './db.js';

let isNativeInitialized = false;

/**
 * Check if app is running on a native platform (Android/iOS)
 */
export function isNativePlatform() {
  return Capacitor.isNativePlatform();
}

/**
 * Initialize Native Local Notifications permissions, action types, and action listeners.
 */
export async function initNativeScheduler() {
  if (!isNativePlatform()) return;
  if (isNativeInitialized) return;

  try {
    // 1. Request notification permissions
    const permResult = await LocalNotifications.checkPermissions();
    if (permResult.display !== 'granted') {
      await LocalNotifications.requestPermissions();
    }

    // 2. Register action types (3 buttons)
    await LocalNotifications.registerActionTypes({
      types: [
        {
          id: 'DOSE_ACTIONS',
          actions: [
            { id: 'take', title: '🟢 LUAT' },
            { id: 'snooze', title: '🟡 AMÂNĂ 10 MIN' },
            { id: 'miss', title: '🔴 RATAT' }
          ]
        }
      ]
    });

    // 3. Listen for action clicks on notifications
    await LocalNotifications.addListener('localNotificationActionPerformed', async (notificationAction) => {
      const { actionId, notification } = notificationAction;
      const extra = notification.extra || {};
      const { medId, timeStr } = extra;
      const todayStr = getTodayString();

      if (!medId || !timeStr) return;

      if (actionId === 'take') {
        await recordDoseStatus(medId, timeStr, todayStr, 'taken');
        if (window.refreshCurrentView) window.refreshCurrentView();
      } else if (actionId === 'miss') {
        await recordDoseStatus(medId, timeStr, todayStr, 'missed');
        if (window.refreshCurrentView) window.refreshCurrentView();
      } else if (actionId === 'snooze') {
        await scheduleSnoozeNotification(extra);
      }
    });

    isNativeInitialized = true;
    console.log('Native LocalNotifications scheduler initialized successfully.');
  } catch (err) {
    console.error('Error initializing Native LocalNotifications:', err);
  }
}

/**
 * Generate a deterministic numeric ID for LocalNotifications from medId and timeStr
 */
function getNotificationId(medId, timeStr) {
  const timeNum = parseInt((timeStr || '08:00').replace(':', ''), 10) || 0;
  return (Math.abs(Number(medId) || 1) * 10000 + timeNum) % 2147483647;
}

/**
 * Schedule recurring daily native notifications for a medication.
 */
export async function scheduleNativeNotifications(med) {
  if (!isNativePlatform()) return;
  if (!med || !med.times || !Array.isArray(med.times) || med.times.length === 0) return;

  try {
    const notificationsToSchedule = [];

    for (const timeStr of med.times) {
      if (!timeStr) continue;
      const [hour, minute] = timeStr.split(':').map(n => parseInt(n, 10));
      if (isNaN(hour) || isNaN(minute)) continue;

      const notifId = getNotificationId(med.id, timeStr);

      notificationsToSchedule.push({
        id: notifId,
        title: `💊 ${med.name}`,
        body: `⏰ Ora ${timeStr} • Doză: ${med.dosageDisplay || '1 doză'}${med.mealReminder ? ' • Înainte de masă' : ''}`,
        schedule: {
          on: {
            hour,
            minute
          },
          repeats: true,
          allowWhileIdle: true
        },
        actionTypeId: 'DOSE_ACTIONS',
        sound: getSoundFileName(med.soundChoice),
        extra: {
          medId: med.id,
          medName: med.name,
          timeStr,
          soundChoice: med.soundChoice,
          dosageDisplay: med.dosageDisplay || '1 doză'
        }
      });
    }

    if (notificationsToSchedule.length > 0) {
      await cancelNativeNotifications(med);
      await LocalNotifications.schedule({ notifications: notificationsToSchedule });
    }
  } catch (err) {
    console.error(`Error scheduling native notification for med ${med.id}:`, err);
  }
}

/**
 * Cancel native notifications for a medication.
 */
export async function cancelNativeNotifications(med) {
  if (!isNativePlatform()) return;
  if (!med || !med.times || !Array.isArray(med.times)) return;

  try {
    const idsToCancel = med.times.map(t => ({ id: getNotificationId(med.id, t) }));
    if (idsToCancel.length > 0) {
      await LocalNotifications.cancel({ notifications: idsToCancel });
    }
  } catch (err) {
    console.warn(`Error canceling native notifications for med ${med.id}:`, err);
  }
}

/**
 * Schedule a snooze notification 10 minutes from now.
 */
async function scheduleSnoozeNotification(extra) {
  if (!isNativePlatform()) return;

  try {
    const snoozeTime = new Date(Date.now() + 10 * 60 * 1000);
    const snoozeId = (getNotificationId(extra.medId, extra.timeStr) + 999) % 2147483647;

    await LocalNotifications.schedule({
      notifications: [
        {
          id: snoozeId,
          title: `💊 ${extra.medName || 'Medicament'} (Reamintire)`,
          body: `⏰ Ora ${extra.timeStr} • Doză: ${extra.dosageDisplay || '1 doză'}`,
          schedule: { at: snoozeTime, allowWhileIdle: true },
          actionTypeId: 'DOSE_ACTIONS',
          sound: getSoundFileName(extra.soundChoice),
          extra
        }
      ]
    });
  } catch (err) {
    console.error('Error scheduling snooze native notification:', err);
  }
}

/**
 * Reschedule all active native notifications from DB.
 */
export async function rescheduleAllNativeNotifications() {
  if (!isNativePlatform()) return;

  try {
    const medications = await getMedications();
    for (const med of medications) {
      await scheduleNativeNotifications(med);
    }
  } catch (err) {
    console.error('Error rescheduling all native notifications:', err);
  }
}

function getSoundFileName(soundChoice) {
  if (!soundChoice || soundChoice === 'bell') return 'bell.wav';
  if (soundChoice === 'vital') return 'vital.wav';
  if (soundChoice === 'alert') return 'alert.wav';
  if (soundChoice === 'zen') return 'zen.wav';
  if (soundChoice === 'echo') return 'echo.wav';
  return 'bell.wav';
}
