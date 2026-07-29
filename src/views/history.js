import { getMedications, getLogsForDate, getTodayString } from '../db.js';

export async function renderHistory(container, navigateTo) {
  const todayStr = getTodayString();
  const meds = await getMedications();
  const logs = await getLogsForDate(todayStr);

  const totalScheduledToday = meds.reduce((acc, m) => acc + (m.times ? m.times.length : 0), 0);
  const totalTakenToday = logs.length;
  const compliancePercent = totalScheduledToday > 0 ? Math.round((totalTakenToday / totalScheduledToday) * 100) : 100;

  const weekDays = generateWeekDays();

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
          <span class="px-3 py-1 bg-secondary-container text-on-secondary-container text-xs font-bold rounded-full">
            ${compliancePercent}% Complianță
          </span>
        </div>

        <!-- Calendar Ribbon -->
        <div class="grid grid-cols-7 gap-1.5 bg-surface-container-lowest p-3 rounded-2xl border border-outline-variant/30 shadow-sm">
          ${weekDays.map(d => `
            <div class="flex flex-col items-center p-2 rounded-xl ${d.isToday ? 'bg-primary-fixed border border-primary/40' : 'bg-surface-container-low'}">
              <span class="text-[10px] font-bold text-on-surface-variant mb-0.5">${d.label}</span>
              <span class="text-sm font-bold text-on-surface mb-1">${d.dayNum}</span>
              <span class="material-symbols-outlined text-sm ${d.completed ? 'text-green-600' : 'text-outline-variant'}" style="font-variation-settings: 'FILL' ${d.completed ? 1 : 0};">
                ${d.completed ? 'check_circle' : 'circle'}
              </span>
            </div>
          `).join('')}
        </div>
      </section>

      <!-- Daily Insights Card -->
      <section class="bg-surface-container-lowest p-4 rounded-2xl shadow-sm border border-outline-variant/30 flex items-center gap-3.5">
        <div class="w-11 h-11 bg-secondary/10 rounded-full flex items-center justify-center shrink-0 text-secondary">
          <span class="material-symbols-outlined">insights</span>
        </div>
        <div>
          <h3 class="text-sm font-bold text-on-surface">Progres Excelent!</h3>
          <p class="text-xs text-on-surface-variant">Ai luat ${totalTakenToday} din ${totalScheduledToday} doze programate astăzi.</p>
        </div>
      </section>

      <!-- Daily Log Details -->
      <section class="space-y-3">
        <h2 class="text-sm font-bold text-on-surface">Detalii Admn. Astăzi</h2>
        <div class="space-y-2.5">
          ${meds.length === 0 ? `
            <p class="text-xs text-outline text-center py-4">Nu există medicamente înregistrate.</p>
          ` : meds.map(med => {
            return med.times.map(t => {
              const log = logs.find(l => l.medicationId === med.id && l.scheduledTime === t);
              const isTaken = !!log;

              return `
                <div class="bg-surface-container-lowest p-3.5 rounded-2xl border border-outline-variant/30 flex items-center justify-between">
                  <div class="flex items-center gap-3">
                    <div class="w-9 h-9 rounded-xl ${med.colorBg || 'bg-primary-fixed'} flex items-center justify-center ${med.colorText || 'text-primary'} shrink-0">
                      <span class="material-symbols-outlined text-xl">${med.icon || 'pill'}</span>
                    </div>
                    <div>
                      <p class="text-sm font-bold text-on-surface">${med.name}</p>
                      <p class="text-xs text-outline font-medium">Programat la ${t}</p>
                    </div>
                  </div>

                  <div class="flex items-center gap-1 text-xs font-bold ${isTaken ? 'text-green-600' : 'text-outline'}">
                    <span class="material-symbols-outlined text-base" style="font-variation-settings: 'FILL' ${isTaken ? 1 : 0};">
                      ${isTaken ? 'check_circle' : 'schedule'}
                    </span>
                    <span>${isTaken ? 'Luat' : 'În așteptare'}</span>
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

function generateWeekDays() {
  const d = new Date();
  const currentDayOfWeek = d.getDay(); // 0 is Sunday, 1 is Monday
  const dayOffset = currentDayOfWeek === 0 ? 6 : currentDayOfWeek - 1; // Monday = 0

  const monday = new Date(d);
  monday.setDate(d.getDate() - dayOffset);

  const labels = ['LU', 'MA', 'MI', 'JO', 'VI', 'SÂ', 'DU'];
  const days = [];

  for (let i = 0; i < 7; i++) {
    const cur = new Date(monday);
    cur.setDate(monday.getDate() + i);

    const isToday = cur.toDateString() === d.toDateString();
    days.push({
      label: labels[i],
      dayNum: cur.getDate(),
      isToday,
      completed: i <= dayOffset // mark past days as completed for design demo
    });
  }

  return days;
}
