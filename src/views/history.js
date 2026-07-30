import { getMedications, getLogsForDate, getTodayString } from '../db.js';

export async function renderHistory(container, navigateTo) {
  const todayStr = getTodayString();
  const meds = await getMedications();
  const logsToday = await getLogsForDate(todayStr);

  // Calculate required vs taken doses for today based on creation time rules
  let totalScheduledToday = 0;
  let totalTakenToday = 0;
  let totalMissedToday = 0;

  meds.forEach(med => {
    const requiredTimes = getRequiredTimesForDate(med, todayStr);
    totalScheduledToday += requiredTimes.length;

    requiredTimes.forEach(t => {
      const log = logsToday.find(l => Number(l.medicationId) === Number(med.id) && l.scheduledTime === t);
      if (log && log.taken === true && !log.missed && log.status !== 'missed') {
        totalTakenToday++;
      } else if (log && (log.missed === true || log.status === 'missed')) {
        totalMissedToday++;
      }
    });
  });

  const compliancePercent = totalScheduledToday > 0 
    ? Math.min(100, Math.round((totalTakenToday / totalScheduledToday) * 100)) 
    : 100;

  const weekDays = await generateWeekDays(meds);

  container.innerHTML = `
    <!-- Top App Bar -->
    <header class="sticky top-0 z-40 bg-background/95 backdrop-blur-md flex justify-between items-center px-container-margin py-stack-md border-b border-outline-variant/20">
      <div class="flex items-center gap-3">
        <span class="material-symbols-outlined text-primary text-2xl">medical_services</span>
        <h1 class="text-lg font-bold text-primary">Istoric Săptămânal</h1>
      </div>
      <button id="btn-hist-settings" class="w-10 h-10 flex items-center justify-center rounded-full hover:bg-surface-container-low transition-colors">
        <span class="material-symbols-outlined text-on-surface-variant">settings</span>
      </button>
    </header>

    <main class="px-container-margin max-w-md mx-auto w-full flex-1 mt-4 space-y-5 pb-32">
      <!-- Weekly Summary Card -->
      <section class="space-y-3">
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-bold text-on-surface">Această Săptămână</h2>
          <span class="px-3 py-1 ${compliancePercent === 100 ? 'bg-green-100 text-green-800 border border-green-300' : 'bg-secondary-container text-on-secondary-container'} text-xs font-bold rounded-full">
            ${compliancePercent}% Complianță
          </span>
        </div>

        <!-- Calendar Ribbon -->
        <div class="grid grid-cols-7 gap-1.5 bg-surface-container-lowest p-3 rounded-2xl border border-outline-variant/30 shadow-sm">
          ${weekDays.map(d => `
            <div class="flex flex-col items-center p-2 rounded-xl ${d.isToday ? 'bg-primary-fixed border border-primary/40 shadow-sm' : 'bg-surface-container-low'}">
              <span class="text-[10px] font-bold text-on-surface-variant mb-0.5">${d.label}</span>
              <span class="text-sm font-bold text-on-surface mb-1">${d.dayNum}</span>
              <span class="material-symbols-outlined text-sm ${d.completed ? 'text-green-600' : (d.hasMissed ? 'text-error' : 'text-outline-variant')}" style="font-variation-settings: 'FILL' ${d.completed || d.hasMissed ? 1 : 0};">
                ${d.completed ? 'check_circle' : (d.hasMissed ? 'cancel' : 'circle')}
              </span>
            </div>
          `).join('')}
        </div>
      </section>

      <!-- Daily Insights Card -->
      <section class="bg-surface-container-lowest p-4 rounded-2xl shadow-sm border border-outline-variant/30 flex items-center gap-3.5">
        <div class="w-11 h-11 ${compliancePercent === 100 ? 'bg-green-100 text-green-700' : 'bg-secondary/10 text-secondary'} rounded-full flex items-center justify-center shrink-0">
          <span class="material-symbols-outlined">${compliancePercent === 100 ? 'verified' : 'insights'}</span>
        </div>
        <div>
          <h3 class="text-sm font-bold text-on-surface">${compliancePercent === 100 ? 'Complianță Maximă! 🎉' : 'Progres Săptămânal'}</h3>
          <p class="text-xs text-on-surface-variant">
            Ai luat <strong>${totalTakenToday}</strong> din <strong>${totalScheduledToday}</strong> doze necesare astăzi.
            ${totalMissedToday > 0 ? ` <span class="text-error font-bold">(${totalMissedToday} ratate)</span>` : ''}
          </p>
        </div>
      </section>

      <!-- Daily Log Details -->
      <section class="space-y-3">
        <h2 class="text-sm font-bold text-on-surface">Detalii Admn. Astăzi</h2>
        <div class="space-y-2.5">
          ${meds.length === 0 ? `
            <p class="text-xs text-outline text-center py-4">Nu există medicamente înregistrate.</p>
          ` : meds.map(med => {
            const isStartDay = todayStr === med.startDate;
            const requiredTimesForMed = getRequiredTimesForDate(med, todayStr);

            return med.times.map(t => {
              const isRequired = requiredTimesForMed.includes(t);
              const log = logsToday.find(l => Number(l.medicationId) === Number(med.id) && l.scheduledTime === t);
              const isTaken = log && log.taken === true && !log.missed && log.status !== 'missed';
              const isMissed = log && (log.missed === true || log.status === 'missed');

              if (isStartDay && !isRequired) {
                return `
                  <div class="bg-surface-container-lowest/60 p-3.5 rounded-2xl border border-outline-variant/20 flex items-center justify-between opacity-70">
                    <div class="flex items-center gap-3">
                      <div class="w-9 h-9 rounded-xl ${med.colorBg || 'bg-primary-fixed'} flex items-center justify-center ${med.colorText || 'text-primary'} shrink-0 opacity-70">
                        <span class="material-symbols-outlined text-xl">${med.icon || 'pill'}</span>
                      </div>
                      <div>
                        <p class="text-sm font-bold text-on-surface line-through decoration-outline/40">${med.name}</p>
                        <p class="text-xs text-outline font-medium">Ora ${t} • Înainte de introducere tratament</p>
                      </div>
                    </div>
                    <span class="text-xs font-semibold text-on-surface-variant px-2.5 py-1 bg-surface-container-high rounded-full">Nu este cazul</span>
                  </div>
                `;
              }

              return `
                <div class="bg-surface-container-lowest p-3.5 rounded-2xl border ${isMissed ? 'border-error/40 bg-error-container/10' : 'border-outline-variant/30'} flex items-center justify-between">
                  <div class="flex items-center gap-3">
                    <div class="w-9 h-9 rounded-xl ${med.colorBg || 'bg-primary-fixed'} flex items-center justify-center ${med.colorText || 'text-primary'} shrink-0">
                      <span class="material-symbols-outlined text-xl">${med.icon || 'pill'}</span>
                    </div>
                    <div>
                      <p class="text-sm font-bold text-on-surface">${med.name}</p>
                      <p class="text-xs text-outline font-medium">Programat la ${t}</p>
                    </div>
                  </div>

                  <div class="flex items-center gap-1 text-xs font-bold ${isTaken ? 'text-green-600' : (isMissed ? 'text-error' : 'text-outline')}">
                    <span class="material-symbols-outlined text-base" style="font-variation-settings: 'FILL' ${isTaken || isMissed ? 1 : 0};">
                      ${isTaken ? 'check_circle' : (isMissed ? 'cancel' : 'schedule')}
                    </span>
                    <span>${isTaken ? 'Luat' : (isMissed ? 'Ratat' : 'În așteptare')}</span>
                  </div>
                </div>
              `;
            }).join('');
          }).join('')}
        </div>
      </section>
    </main>
  `;

  const btnSet = container.querySelector('#btn-hist-settings');
  if (btnSet) btnSet.addEventListener('click', () => navigateTo('notifications'));
}

/**
 * Returns required dose times for a given date.
 * On day 1 of treatment (startDate), dose times scheduled prior to treatment creation time are excluded.
 */
export function getRequiredTimesForDate(med, dateStr) {
  if (!med.times || !Array.isArray(med.times)) return [];

  if (med.startDate && med.durationDays) {
    const start = new Date(med.startDate);
    const sel = new Date(dateStr);
    const diffTime = sel.getTime() - start.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 3600 * 24));

    if (diffDays < 0 || diffDays >= med.durationDays) {
      return [];
    }
  }

  if (dateStr === med.startDate) {
    if (med.createdAtTime) {
      return med.times.filter(t => t >= med.createdAtTime);
    } else {
      return med.times;
    }
  }

  return med.times;
}

/**
 * Generates weekly calendar ribbon with accurate historical compliance calculation.
 */
async function generateWeekDays(meds) {
  const d = new Date();
  const currentDayOfWeek = d.getDay(); // 0 is Sunday, 1 is Monday
  const dayOffset = currentDayOfWeek === 0 ? 6 : currentDayOfWeek - 1;

  const monday = new Date(d);
  monday.setDate(d.getDate() - dayOffset);

  const labels = ['LU', 'MA', 'MI', 'JO', 'VI', 'SÂ', 'DU'];
  const days = [];

  for (let i = 0; i < 7; i++) {
    const cur = new Date(monday);
    cur.setDate(monday.getDate() + i);

    const year = cur.getFullYear();
    const month = String(cur.getMonth() + 1).padStart(2, '0');
    const day = String(cur.getDate()).padStart(2, '0');
    const fullDate = `${year}-${month}-${day}`;
    const isToday = cur.toDateString() === d.toDateString();

    const logsForDay = await getLogsForDate(fullDate);

    let dayRequired = 0;
    let dayTaken = 0;
    let hasMissed = false;

    meds.forEach(m => {
      const req = getRequiredTimesForDate(m, fullDate);
      dayRequired += req.length;
      req.forEach(t => {
        const l = logsForDay.find(log => Number(log.medicationId) === Number(m.id) && log.scheduledTime === t);
        if (l && l.taken === true && !l.missed && l.status !== 'missed') {
          dayTaken++;
        } else if (l && (l.missed === true || l.status === 'missed')) {
          hasMissed = true;
        }
      });
    });

    const isPastOrToday = cur <= d;
    const completed = isPastOrToday && (dayRequired === 0 || dayTaken >= dayRequired);

    days.push({
      label: labels[i],
      dayNum: cur.getDate(),
      isToday,
      completed,
      hasMissed
    });
  }

  return days;
}
