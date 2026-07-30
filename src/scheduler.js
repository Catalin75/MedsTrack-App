// Real-time Dose Scheduler & Background Notification Service for MedsTrack
import { getMedications, getLogsForDate, getTodayString, toggleDoseLog } from './db.js';
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

  // Clear existing interval if re-initialized
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
  }

  // Initial check on load
  checkScheduledDoses();

  // Run check every 10 seconds to catch exact minute transitions
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

      // Verify treatment date range
      if (med.startDate && med.durationDays) {
        const start = new Date(med.startDate);
        const todayDate = new Date(todayStr);
        const diffTime = todayDate.getTime() - start.getTime();
        const diffDays = Math.floor(diffTime / (1000 * 3600 * 24));

        if (diffDays < 0 || diffDays >= med.durationDays) {
          continue; // Medication is not active for today
        }
      }

      for (const timeStr of med.times) {
        if (!timeStr) continue;

        const key = `${med.id}_${todayStr}_${timeStr}`;

        // Check if current system time matches the scheduled dose time
        if (timeStr === currentTimeStr) {
          // Check if dose was already taken today
          const isAlreadyTaken = todayLogs.some(l => l.medicationId === med.id && l.scheduledTime === timeStr && l.taken);
          
          if (isAlreadyTaken || notifiedDosesSet.has(key)) {
            continue;
          }

          // Mark dose as notified for today
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
 * Sends a system desktop/mobile Web Notification.
 */
function sendWebNotification(med, timeStr) {
  if (!('Notification' in window)) return;

  const title = ` Memento Medicament: ${med.name}`;
  const options = {
    body: `Ora ${timeStr} - Este timpul pentru ${med.dosageDisplay || 'doza programată'}.\n${med.mealReminder ? 'Înainte de masă' : 'Tratament cronic'}`,
    icon: '/manifest.json',
    tag: `dose_${med.id}_${todayStringClean(timeStr)}`,
    renotify: true,
    requireInteraction: med.criticalAlert || false
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
 * Displays a full modal alert inside the application interface.
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

      <div class="pt-2 flex flex-col gap-2">
        <button id="btn-modal-take-dose" class="w-full h-13 bg-primary text-on-primary font-bold rounded-2xl shadow-lg hover:bg-primary-container active:scale-95 transition-all flex items-center justify-center gap-2 text-base">
          <span class="material-symbols-outlined text-xl">check_circle</span>
          <span>Am luat medicamentul</span>
        </button>
        <button id="btn-modal-close-alert" class="w-full h-10 bg-surface-container-high text-on-surface-variant font-semibold rounded-2xl hover:bg-surface-variant active:scale-95 transition-all text-xs">
          Închide alertă
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const btnTake = modal.querySelector('#btn-modal-take-dose');
  if (btnTake) {
    btnTake.addEventListener('click', async () => {
      await toggleDoseLog(med.id, timeStr, getTodayString());
      modal.remove();
      if (window.refreshCurrentView) {
        window.refreshCurrentView();
      }
    });
  }

  const btnClose = modal.querySelector('#btn-modal-close-alert');
  if (btnClose) {
    btnClose.addEventListener('click', () => {
      modal.remove();
    });
  }
}
