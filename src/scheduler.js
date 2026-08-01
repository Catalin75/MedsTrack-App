// Real-time Dose Scheduler & Background Notification Service for MedsTrack
import { getMedications, getLogsForDate, getTodayString, recordDoseStatus, getMedication } from './db.js';
import { playNotificationSound } from './audio.js';
import { LocalNotifications } from '@capacitor/local-notifications';
import { App } from '@capacitor/app';

let schedulerInterval = null;
const notifiedDosesSet = new Set(); // Tracks format: `${medId}_${dateStr}_${timeStr}`
let isListenerAttached = false;

/**
 * Initializes the background scheduler and requests notification permissions.
 */
export function initDoseScheduler() {
  // Request Web Notifications permission
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission().catch(err => {
      console.log('Notification permission request note:', err);
    });
  }

  // Attach auto-update listener on medication changes
  if (typeof window !== 'undefined' && !isListenerAttached) {
    window.addEventListener('medications-updated', scheduleNativeLocalNotifications);
    isListenerAttached = true;
  }

  // Schedule native mobile OS local notifications via Capacitor
  scheduleNativeLocalNotifications();

  if (schedulerInterval) {
    clearInterval(schedulerInterval);
  }

  checkScheduledDoses();
  schedulerInterval = setInterval(checkScheduledDoses, 10000);
}

/**
 * Schedules exact OS-level background notifications on mobile devices via Capacitor.
 */
export async function scheduleNativeLocalNotifications() {
  try {
    const isCapacitor = window.Capacitor && window.Capacitor.isNativePlatform();
    if (!isCapacitor) return;

    // 1. Request Android Notification Permissions
    const perm = await LocalNotifications.requestPermissions();
    if (perm.display !== 'granted') return;

    // 2. Register Interactive Action Types (🟢 Luat, 🟡 Amână 10 min, 🔴 Ratat) - All Background (foreground: false)
    await LocalNotifications.registerActionTypes({
      types: [
        {
          id: 'MED_ALARM_ACTIONS',
          actions: [
            { id: 'action_take', title: '🟢 Luat', foreground: false },
            { id: 'action_snooze', title: '🟡 Amână 10 min', foreground: false },
            { id: 'action_miss', title: '🔴 Ratat', foreground: false }
          ]
        }
      ]
    }).catch(err => console.log('ActionTypes reg note:', err));

    // 3. Play Recorded Voice Memo when Notification is delivered on screen
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

    // 4. Attach Action Listener for Notification Buttons (Silent Background Execution + Immediate Minimize)
    LocalNotifications.addListener('localNotificationActionPerformed', async (notificationAction) => {
      try {
        const actionId = notificationAction.actionId;
        const extra = notificationAction.notification.extra || {};
        const { medId, timeStr } = extra;

        if (!medId || !timeStr) return;
        const todayStr = getTodayString();
        const key = `${medId}_${todayStr}_${timeStr}`;

        // Track as already handled so in-app modal does not pop up if app is opened later
        notifiedDosesSet.add(key);

        const med = await getMedication(medId);
        if (med) {
          if (actionId === 'action_take') {
            await recordDoseStatus(medId, timeStr, todayStr, 'taken');
          } else if (actionId === 'action_snooze') {
            // Schedule a single 10-minute snooze notification
            const snoozeDate = new Date(Date.now() + 10 * 60 * 1000);
            const soundKey = (med.soundChoice || 'bell').toLowerCase().replace(/[^a-z0-9]/g, '');
            await LocalNotifications.schedule({
              notifications: [{
                title: `⏰ AMÂNAT: ${med.name}`,
                body: `⏰ Ora ${timeStr} • Doză: ${med.dosageDisplay || '1 comprimat'}`,
                id: Math.floor(Math.random() * 800000) + 100000,
                schedule: { at: snoozeDate, allowWhileIdle: true },
                channelId: (soundKey.startsWith('voice') ? 'medstrack_channel_bell' : `medstrack_channel_${soundKey}`),
                smallIcon: 'ic_launcher',
                iconColor: '#0052b4',
                actionTypeId: 'MED_ALARM_ACTIONS',
                extra: { medId: med.id, timeStr, soundChoice: med.soundChoice }
              }]
            }).catch(() => {});
          } else if (actionId === 'action_miss') {
            await recordDoseStatus(medId, timeStr, todayStr, 'missed');
          }
        }

        // Dismiss delivered notification from Android status bar tray
        await LocalNotifications.removeAllDelivered().catch(() => {});

        if (window.refreshCurrentView) {
          window.refreshCurrentView();
        }

        // Ensure user is NOT kept inside app when tapping action buttons
        await App.minimizeApp().catch(() => {});
      } catch (err) {
        console.log('Action listener note:', err);
      }
    });

    const medications = await getMedications();
    const todayStr = getTodayString();
    const todayLogs = await getLogsForDate(todayStr);

    const notificationsToSchedule = [];
    let notificationIdCounter = 1000;

    // Cancel previously pending local notifications to refresh cleanly
    const pending = await LocalNotifications.getPending().catch(() => ({ notifications: [] }));
    if (pending && pending.notifications && pending.notifications.length > 0) {
      await LocalNotifications.cancel(pending).catch(() => {});
    }

    for (const med of medications) {
      if (!med.times || !Array.isArray(med.times)) continue;

      // Deduplicate Title (Avoid [Tttt] Tttt when category === name)
      let title = `💊 ${med.name}`;
      if (med.treatmentCategory && med.treatmentCategory.trim() !== '' && med.treatmentCategory.toLowerCase() !== med.name.toLowerCase() && med.treatmentCategory.toLowerCase() !== 'general') {
        title = `💊 [${med.treatmentCategory}] ${med.name}`;
      }

      // Selected Sound Channel
      const soundChoice = med.soundChoice || 'bell';
      const soundKey = soundChoice.toLowerCase().replace(/[^a-z0-9]/g, '');
      const isVoice = soundKey.startsWith('voice');
      const channelId = isVoice ? 'medstrack_channel_voice' : `medstrack_channel_${soundKey}`;
      const channelSound = isVoice ? 'bell.wav' : `${soundKey}.wav`;

      await LocalNotifications.createChannel({
        id: channelId,
        name: isVoice ? 'Alerte Memento Vocal' : `Alerte ${soundKey}`,
        description: 'Notificări prioritare plutitoare pe ecran pentru administrarea medicamentelor',
        importance: 5, // IMPORTANCE_MAX (High Priority Floating Banner)
        visibility: 1, // VISIBILITY_PUBLIC on Lock Screen
        sound: channelSound,
        vibration: true,
        lights: true,
        lightColor: '#0052b4'
      }).catch(() => {});

      for (let tIdx = 0; tIdx < med.times.length; tIdx++) {
        const timeStr = med.times[tIdx];
        if (!timeStr) continue;

        const [hours, minutes] = timeStr.split(':').map(Number);
        
        // Check if this dose was ALREADY logged today (taken or missed)
        const isAlreadyLogged = todayLogs.some(l => Number(l.medicationId) === Number(med.id) && l.scheduledTime === timeStr);

        const scheduleDate = new Date();
        scheduleDate.setHours(hours, minutes, 0, 0);

        // If ALREADY LOGGED TODAY or time has passed today, schedule for TOMORROW!
        if (isAlreadyLogged || scheduleDate.getTime() <= (Date.now() + 60000)) {
          scheduleDate.setDate(scheduleDate.getDate() + 1);
        }

        const isUnlim = med.isUnlimited || med.totalStock === 'unlimited';
        const bodyText = isUnlim
          ? `⏰ Ora ${timeStr} • Doză: ${med.dosageDisplay || '1 comprimat'}`
          : `⏰ Ora ${timeStr} • Doză: ${med.dosageDisplay || '1 comprimat'} (${med.remainingStock !== undefined ? med.remainingStock : (med.totalStock || 20)} doze)`;

        const uniqueId = Number(`${med.id || 1}${tIdx + 1}${notificationIdCounter++}`);

        notificationsToSchedule.push({
          title,
          body: bodyText,
          id: Math.abs(uniqueId) % 2147483647,
          schedule: {
            at: scheduleDate,
            repeats: true,
            every: 'day',
            allowWhileIdle: true // WAKES UP CPU / PHONE SCREEN IN STAND-BY DOZE MODE
          },
          channelId,
          sound: channelSound,
          smallIcon: 'ic_launcher',
          iconColor: '#0052b4',
          actionTypeId: 'MED_ALARM_ACTIONS',
          extra: { medId: med.id, timeStr, soundChoice }
        });
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

/**
 * Checks all active medications against current time and triggers alarms/notifications if due.
 */
export async function checkScheduledDoses() {
  try {
    const isCapacitor = window.Capacitor && window.Capacitor.isNativePlatform();
    if (isCapacitor) return; // NATIVE ANDROID USES EXCLUSIVELY SYSTEM NOTIFICATIONS! NO DUPES OR IN-APP MODALS!

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
          // Check if dose has already been logged (either taken or missed)
          const isLogged = todayLogs.some(l => l.medicationId === med.id && l.scheduledTime === timeStr);
          
          if (isLogged || notifiedDosesSet.has(key)) {
            continue;
          }

          notifiedDosesSet.add(key);

          // 1. Play Audio Alarm Tone (Repeated 3 times)
          playNotificationSound(med.soundChoice || 'bell', med.criticalAlert ? 100 : 80, 3);

          // 2. Trigger Web/System Notification
          sendWebNotification(med, timeStr);

          // 3. Display In-App Notification Alarm Modal
          displayInAppDoseModal(med, timeStr);
        }
      }
    }
  } catch (error) {
    console.error('Error during scheduled doses check:', error);
  }
}

/**
 * Sends a system desktop/mobile Web Notification with detailed header (Treatment + Medication) and 3 Actions.
 */
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

/**
 * Snoozes a notification for 10 minutes without modifying DB or stock.
 */
export function snoozeDose(med, timeStr) {
  showToast(`Notificarea pentru ${med.name} (${timeStr}) a fost amânată cu 10 minute.`);

  setTimeout(() => {
    playNotificationSound(med.soundChoice || 'bell', med.criticalAlert ? 100 : 80, 3);
    sendWebNotification(med, timeStr);
    displayInAppDoseModal(med, timeStr);
  }, 10 * 60 * 1000);
}

/**
 * Displays a detailed 3-button modal alert inside the application interface.
 */
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
        <!-- Button 1: Luat -->
        <button id="btn-modal-take-dose" class="w-full h-12 bg-primary text-on-primary font-bold rounded-2xl shadow-lg hover:bg-primary-container active:scale-95 transition-all flex items-center justify-center gap-2 text-sm">
          <span class="material-symbols-outlined text-xl">check_circle</span>
          <span>Luat</span>
        </button>

        <!-- Button 2: Amână 10 minute -->
        <button id="btn-modal-snooze-dose" class="w-full h-11 bg-secondary-container text-on-secondary-container font-bold rounded-2xl border border-secondary/30 hover:bg-secondary-fixed active:scale-95 transition-all flex items-center justify-center gap-2 text-sm">
          <span class="material-symbols-outlined text-lg">schedule</span>
          <span>Amână 10 minute</span>
        </button>

        <!-- Button 3: Ratat -->
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
    const isUnlim = med.isUnlimited || med.totalStock === 'unlimited';
    const toastMsg = isUnlim
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
