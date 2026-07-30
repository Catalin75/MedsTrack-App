// Real-time Dose Scheduler & Background Notification Service for MedsTrack
import { getMedications, getLogsForDate, getTodayString, recordDoseStatus } from './db.js';
import { playNotificationSound } from './audio.js';

let schedulerInterval = null;
const notifiedDosesSet = new Set(); // Tracks format: `${medId}_${dateStr}_${timeStr}`

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

  if (schedulerInterval) {
    clearInterval(schedulerInterval);
  }

  checkScheduledDoses();
  schedulerInterval = setInterval(checkScheduledDoses, 10000);
}

/**
 * Checks all active medications against current time and triggers alarms/notifications if due.
 */
export async function checkScheduledDoses() {
  try {
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

          // 1. Play Audio Alarm Tone
          playNotificationSound(med.soundChoice || 'bell', med.criticalAlert ? 100 : 80);

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
 * Sends a system desktop/mobile Web Notification with 3 Action Buttons.
 */
function sendWebNotification(med, timeStr) {
  if (!('Notification' in window)) return;

  const title = ` Memento Medicament: ${med.name}`;
  const options = {
    body: `Ora ${timeStr} - ${med.dosageDisplay || '1 doză'}\n${med.mealReminder ? 'Înainte de masă' : 'Tratament cronic'}`,
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
    playNotificationSound(med.soundChoice || 'bell', med.criticalAlert ? 100 : 80);
    sendWebNotification(med, timeStr);
    displayInAppDoseModal(med, timeStr);
  }, 10 * 60 * 1000);
}

/**
 * Displays a 3-button modal alert inside the application interface.
 */
export function displayInAppDoseModal(med, timeStr) {
  const existing = document.getElementById('dose-alarm-modal');
  if (existing) {
    existing.remove();
  }

  const modal = document.createElement('div');
  modal.id = 'dose-alarm-modal';
  modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-300';
  modal.innerHTML = `
    <div class="bg-surface-container-lowest w-full max-w-sm rounded-3xl p-6 shadow-2xl border-2 border-primary/50 text-center space-y-4 animate-in zoom-in-95 duration-200">
      <div class="w-16 h-16 bg-primary-fixed rounded-full flex items-center justify-center text-primary mx-auto animate-bounce">
        <span class="material-symbols-outlined text-4xl">notifications_active</span>
      </div>
      <div>
        <span class="inline-block px-3 py-1 bg-primary-fixed text-primary font-bold text-xs rounded-full mb-1.5">
          Ora limită: ${timeStr}
        </span>
        <h2 class="text-xl font-bold text-on-surface">${med.name}</h2>
        <p class="text-base font-bold text-primary mt-1">${med.dosageDisplay || '1 doză'}</p>
        ${med.mealReminder ? '<p class="text-xs font-bold text-secondary mt-1"> Memento înainte de masă (30 min)</p>' : ''}
      </div>

      <div class="pt-2 flex flex-col gap-2.5">
        <!-- Button 1: Luat -->
        <button id="btn-modal-take-dose" class="w-full h-12 bg-primary text-on-primary font-bold rounded-2xl shadow-lg hover:bg-primary-container active:scale-95 transition-all flex items-center justify-center gap-2 text-sm">
          <span class="material-symbols-outlined text-lg">check_circle</span>
          <span>Luat</span>
        </button>

        <!-- Button 2: Amână 10 minute -->
        <button id="btn-modal-snooze-dose" class="w-full h-12 bg-secondary-container text-on-secondary-container font-bold rounded-2xl hover:bg-secondary-container/80 active:scale-95 transition-all flex items-center justify-center gap-2 text-sm">
          <span class="material-symbols-outlined text-lg">schedule</span>
          <span>Amână 10 minute</span>
        </button>

        <!-- Button 3: Ratat -->
        <button id="btn-modal-miss-dose" class="w-full h-12 bg-error-container/40 text-error font-bold rounded-2xl hover:bg-error-container active:scale-95 transition-all flex items-center justify-center gap-2 text-sm">
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
    showToast(`Doza de ${med.name} a fost marcată ca Luată. Stocul s-a actualizat.`);
    if (window.refreshCurrentView) {
      window.refreshCurrentView();
    }
  });

  // 2. Action AMÂNĂ 10 MINUTE
  modal.querySelector('#btn-modal-snooze-dose').addEventListener('click', () => {
    modal.remove();
    snoozeDose(med, timeStr);
  });

  // 3. Action RATAT
  modal.querySelector('#btn-modal-miss-dose').addEventListener('click', async () => {
    await recordDoseStatus(med.id, timeStr, getTodayString(), 'missed');
    modal.remove();
    showToast(`Doza de ${med.name} a fost marcată ca Ratată. Stocul nu s-a modificat.`);
    if (window.refreshCurrentView) {
      window.refreshCurrentView();
    }
  });
}

function showToast(message) {
  const existing = document.getElementById('app-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'app-toast';
  toast.className = 'fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white text-xs font-semibold px-4 py-2.5 rounded-full shadow-xl border border-white/20 animate-in fade-in slide-in-from-top-4 duration-200';
  toast.innerText = message;

  document.body.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 3500);
}
