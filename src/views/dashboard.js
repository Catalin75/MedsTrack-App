import { getMedications, getLogsForDate, getTodayString, toggleDoseLog, saveMedication, deleteMedication, clearAllData } from '../db.js';
import { playNotificationSound } from '../audio.js';

let selectedDate = getTodayString();
let activeModalMed = null;

export async function renderDashboard(container, navigateTo) {
  const meds = await getMedications();
  const logs = await getLogsForDate(selectedDate);

  // Group medications by daily periods
  const scheduleItems = [];

  meds.forEach(med => {
    // Check if treatment is active for selected date
    if (med.startDate && med.durationDays) {
      const start = new Date(med.startDate);
      const sel = new Date(selectedDate);
      const diffTime = sel.getTime() - start.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 3600 * 24));

      if (diffDays < 0 || diffDays >= med.durationDays) {
        return; // Skip if date is out of treatment range
      }
    }

    if (med.times && Array.isArray(med.times)) {
      med.times.forEach(timeStr => {
        const hour = parseInt(timeStr.split(':')[0], 10);
        let period = 'Dimineața';
        if (hour >= 12 && hour < 17) period = 'Prânz';
        else if (hour >= 17) period = 'Seară';

        const isTaken = logs.some(l => l.medicationId === med.id && l.scheduledTime === timeStr && l.taken);

        scheduleItems.push({
          med,
          timeStr,
          period,
          isTaken
        });
      });
    }
  });

  // Sort by time
  scheduleItems.sort((a, b) => a.timeStr.localeCompare(b.timeStr));

  const dateList = generateDateScrollerList(selectedDate);
  const formattedHeaderDate = formatDisplayDate(selectedDate);

  container.innerHTML = `
    <!-- Top AppBar -->
    <header class="sticky top-0 z-40 bg-background/95 backdrop-blur-md flex justify-between items-center px-container-margin py-stack-md w-full border-b border-outline-variant/20">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-full overflow-hidden border-2 border-primary-fixed bg-primary-fixed/40 flex items-center justify-center text-primary font-bold text-lg">
          M
        </div>
        <div>
          <h1 class="text-xl font-bold text-on-surface leading-snug">Bună dimineața!</h1>
          <p class="text-xs text-outline font-medium">${formattedHeaderDate}</p>
        </div>
      </div>
      <div class="flex items-center gap-1">
        ${meds.length > 0 ? `
          <button id="btn-reset-data" title="Șterge toate datele" class="px-2.5 py-1 text-[11px] font-semibold text-error/80 hover:text-error hover:bg-error-container/30 rounded-full transition-all">
            Resetare
          </button>
        ` : ''}
        <button id="calendar-btn" class="w-9 h-9 flex items-center justify-center rounded-full hover:bg-surface-container-low transition-colors active:scale-95 text-primary">
          <span class="material-symbols-outlined text-xl">calendar_today</span>
        </button>
      </div>
    </header>

    <main class="px-container-margin max-w-md mx-auto w-full flex-1">
      <!-- Date Scroller -->
      <section class="mt-3 mb-6">
        <div class="flex gap-2.5 overflow-x-auto hide-scrollbar py-2 px-1">
          ${dateList.map(d => `
            <button data-date="${d.fullDate}" class="date-pill flex flex-col items-center justify-center min-w-[56px] h-20 rounded-2xl transition-all duration-200 ${
              d.fullDate === selectedDate
                ? 'bg-primary text-on-primary shadow-md scale-105 font-bold'
                : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'
            }">
              <span class="text-xs ${d.fullDate === selectedDate ? 'text-on-primary/80' : 'text-outline'}">${d.dayName}</span>
              <span class="text-lg font-bold mt-0.5">${d.dayNum}</span>
              ${d.fullDate === selectedDate ? '<div class="w-1.5 h-1.5 bg-on-primary rounded-full mt-1"></div>' : ''}
            </button>
          `).join('')}
        </div>
      </section>

      <!-- Main Schedule Content or Empty State -->
      ${meds.length === 0 ? renderEmptyDashboardState() : `
        <div class="space-y-6">
          ${renderPeriodSection('Dimineața', 'light_mode', 'text-tertiary', scheduleItems, selectedDate, navigateTo)}
          ${renderPeriodSection('Prânz', 'sunny', 'text-secondary', scheduleItems, selectedDate, navigateTo)}
          ${renderPeriodSection('Seară', 'dark_mode', 'text-primary', scheduleItems, selectedDate, navigateTo)}
        </div>
      `}
    </main>

    <!-- Floating Action Button (FAB) -->
    <button id="fab-add" class="fixed bottom-20 right-5 w-14 h-14 bg-primary text-on-primary rounded-full shadow-xl flex items-center justify-center active:scale-90 transition-transform z-40 hover:bg-primary-container">
      <span class="material-symbols-outlined text-[32px]">add</span>
    </button>

    <!-- Action Modal for Editing/Deleting Treatment -->
    <div id="action-modal" class="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end justify-center p-4 hidden transition-opacity">
      <div class="w-full max-w-md bg-surface-container-lowest rounded-3xl p-5 shadow-2xl space-y-4 animate-in slide-in-from-bottom duration-200">
        <div class="flex justify-between items-center pb-2 border-b border-outline-variant/20">
          <div id="modal-med-info"></div>
          <button id="modal-close" class="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container text-outline">
            <span class="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

        <div class="space-y-2">
          <button id="btn-modal-edit" class="w-full p-3.5 bg-surface-container-low hover:bg-primary-fixed/20 text-on-surface rounded-2xl flex items-center gap-3 font-semibold text-sm transition-all">
            <span class="material-symbols-outlined text-primary">edit</span>
            <span>Editează tratamentul (nume, ore, doze)</span>
          </button>

          <button id="btn-modal-refill" class="w-full p-3.5 bg-surface-container-low hover:bg-secondary-container/30 text-on-surface rounded-2xl flex items-center gap-3 font-semibold text-sm transition-all">
            <span class="material-symbols-outlined text-secondary">add_shopping_cart</span>
            <span>Reumple stocul</span>
          </button>

          <button id="btn-modal-delete" class="w-full p-3.5 bg-error-container/40 hover:bg-error-container text-error rounded-2xl flex items-center gap-3 font-semibold text-sm transition-all">
            <span class="material-symbols-outlined text-error">delete</span>
            <span>Șterge tratamentul</span>
          </button>
        </div>
      </div>
    </div>
  `;

  // Event Listeners
  container.querySelectorAll('.date-pill').forEach(btn => {
    btn.addEventListener('click', (e) => {
      selectedDate = e.currentTarget.getAttribute('data-date');
      renderDashboard(container, navigateTo);
    });
  });

  container.querySelectorAll('.toggle-dose-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const medId = Number(btn.getAttribute('data-med-id'));
      const timeStr = btn.getAttribute('data-time');

      const res = await toggleDoseLog(medId, timeStr, selectedDate);
      if (res.taken) {
        playNotificationSound('bell', 60);
      }
      renderDashboard(container, navigateTo);
    });
  });

  // Open Action Modal on Edit Icon or Card click
  container.querySelectorAll('.btn-open-options').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const medId = Number(btn.getAttribute('data-med-id'));
      const med = meds.find(m => m.id === medId);
      if (med) {
        openActionModal(container, med, navigateTo);
      }
    });
  });

  const fab = container.querySelector('#fab-add');
  if (fab) {
    fab.addEventListener('click', () => navigateTo('addMedication'));
  }

  const btnEmptyAdd = container.querySelector('#btn-empty-add-dash');
  if (btnEmptyAdd) {
    btnEmptyAdd.addEventListener('click', () => navigateTo('addMedication'));
  }

  const btnReset = container.querySelector('#btn-reset-data');
  if (btnReset) {
    btnReset.addEventListener('click', async () => {
      if (confirm('Sigur dorești să ștergi toate tratamentele introduse pentru a porni de la zero?')) {
        await clearAllData();
        renderDashboard(container, navigateTo);
      }
    });
  }
}

function openActionModal(container, med, navigateTo) {
  activeModalMed = med;
  const modal = container.querySelector('#action-modal');
  const info = container.querySelector('#modal-med-info');

  if (info) {
    info.innerHTML = `
      <div>
        <h3 class="text-base font-bold text-on-surface">${med.name}</h3>
        <p class="text-xs text-outline">${med.treatmentCategory || 'General'} • ${med.dosageDisplay || ''}</p>
      </div>
    `;
  }

  if (modal) {
    modal.classList.remove('hidden');

    const btnClose = modal.querySelector('#modal-close');
    if (btnClose) btnClose.onclick = () => modal.classList.add('hidden');

    const btnEdit = modal.querySelector('#btn-modal-edit');
    if (btnEdit) {
      btnEdit.onclick = () => {
        modal.classList.add('hidden');
        navigateTo('editMedication', { editId: med.id });
      };
    }

    const btnRefill = modal.querySelector('#btn-modal-refill');
    if (btnRefill) {
      btnRefill.onclick = async () => {
        modal.classList.add('hidden');
        const added = prompt(`Câte doze dorești să adaugi la stocul de ${med.name}?`, '20');
        if (added && !isNaN(added)) {
          const addVal = parseInt(added, 10);
          const curStk = typeof med.remainingStock === 'number' ? med.remainingStock : parseInt(med.remainingStock || med.totalStock || '20', 10);
          med.remainingStock = (isNaN(curStk) ? 20 : curStk) + addVal;
          await saveMedication(med);
          renderDashboard(container, navigateTo);
        }
      };
    }

    const btnDelete = modal.querySelector('#btn-modal-delete');
    if (btnDelete) {
      btnDelete.onclick = async () => {
        modal.classList.add('hidden');
        if (confirm(`Sigur dorești să ștergi definitiv tratamentul "${med.name}"?`)) {
          await deleteMedication(med.id);
          renderDashboard(container, navigateTo);
        }
      };
    }
  }
}

function renderEmptyDashboardState() {
  return `
    <div class="text-center py-10 px-6 bg-surface-container-lowest rounded-3xl border-2 border-dashed border-outline-variant/50 shadow-sm space-y-4 my-4">
      <div class="w-16 h-16 bg-primary-fixed/40 rounded-full flex items-center justify-center mx-auto text-primary">
        <span class="material-symbols-outlined text-3xl">medical_services</span>
      </div>
      <div>
        <h2 class="text-base font-bold text-on-surface">Niciun tratament configurat</h2>
        <p class="text-xs text-on-surface-variant max-w-xs mx-auto mt-1">
          Aplicația este pregătită pentru utilizare. Apasă pe butonul de mai jos pentru a-ți defini primul tratament (ex: Gripă, Hepatită, Tensiune sau Tratament 1).
        </p>
      </div>
      <button id="btn-empty-add-dash" class="px-6 py-3 bg-primary text-on-primary font-bold text-xs rounded-full shadow-lg hover:bg-primary-container transition-all active:scale-95">
        + Definește Primul Tratament
      </button>
    </div>
  `;
}

function renderPeriodSection(periodTitle, iconName, colorClass, scheduleItems, dateStr, navigateTo) {
  const items = scheduleItems.filter(item => item.period === periodTitle);
  if (items.length === 0) return '';

  return `
    <section>
      <div class="flex items-center gap-2 mb-3">
        <span class="material-symbols-outlined ${colorClass}">${iconName}</span>
        <h2 class="text-xs font-bold text-on-surface-variant uppercase tracking-wider">${periodTitle}</h2>
      </div>
      <div class="space-y-3">
        ${items.map(item => `
          <div class="bg-surface-container-lowest p-4 rounded-2xl border ${item.isTaken ? 'border-primary/40 bg-surface-container-lowest/70' : 'border-outline-variant/40'} shadow-sm flex items-center justify-between group hover:shadow-md transition-all">
            <div class="flex items-center gap-3.5 flex-1 pr-2">
              <div class="w-12 h-12 rounded-xl ${item.med.colorBg || 'bg-primary-fixed'} flex items-center justify-center ${item.med.colorText || 'text-primary'} shrink-0">
                <span class="material-symbols-outlined text-[26px]">${item.med.icon || 'pill'}</span>
              </div>
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2 flex-wrap">
                  <h3 class="text-base font-bold text-on-surface truncate ${item.isTaken ? 'line-through opacity-70' : ''}">${item.med.name}</h3>
                  ${item.med.treatmentCategory ? `
                    <span class="text-[10px] bg-secondary-container/50 text-on-secondary-container px-2 py-0.5 rounded-full font-bold shrink-0">
                      ${item.med.treatmentCategory}
                    </span>
                  ` : ''}
                  <!-- Edit Icon Button -->
                  <button data-med-id="${item.med.id}" class="btn-open-options p-1 text-outline hover:text-primary hover:bg-surface-container rounded-full transition-all ml-auto" title="Opțiuni tratament">
                    <span class="material-symbols-outlined text-lg">more_vert</span>
                  </button>
                </div>
                <div class="flex items-center gap-2 mt-1 flex-wrap">
                  <span class="text-xs bg-surface-container-high px-2 py-0.5 rounded-md text-on-surface-variant font-medium">${item.med.dosageDisplay || '1 comprimat'}</span>
                  <span class="text-xs text-primary font-bold">${item.timeStr}</span>
                  <span class="text-[11px] ${item.med.isUnlimited ? 'text-outline' : (typeof item.med.remainingStock === 'number' && item.med.remainingStock <= 5 ? 'text-error font-bold' : 'text-on-surface-variant')}">
                    • Stoc: ${item.med.isUnlimited ? '∞' : (item.med.remainingStock !== undefined ? item.med.remainingStock : (item.med.totalStock || 20))} doze
                  </span>
                </div>
              </div>
            </div>
            <button data-med-id="${item.med.id}" data-time="${item.timeStr}" class="toggle-dose-btn w-11 h-11 rounded-full ${
              item.isTaken
                ? 'bg-primary text-on-primary shadow-md scale-105'
                : 'border-2 border-outline-variant flex items-center justify-center text-outline hover:border-primary hover:text-primary'
            } flex items-center justify-center transition-all active:scale-90 shrink-0">
              <span class="material-symbols-outlined" style="font-variation-settings: 'FILL' ${item.isTaken ? 1 : 0};">${item.isTaken ? 'check_circle' : 'check'}</span>
            </button>
          </div>
        `).join('')}
      </div>
    </section>
  `;
}

function generateDateScrollerList(currentDateStr) {
  const current = new Date(currentDateStr);
  const days = [];
  const dayNames = ['Dum', 'Lun', 'Mar', 'Mie', 'Joi', 'Vin', 'Sâm'];

  for (let i = -3; i <= 3; i++) {
    const d = new Date(current);
    d.setDate(current.getDate() + i);

    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const fullDate = `${year}-${month}-${day}`;

    days.push({
      fullDate,
      dayName: dayNames[d.getDay()],
      dayNum: d.getDate()
    });
  }

  return days;
}

function formatDisplayDate(dateStr) {
  const d = new Date(dateStr);
  const dayNames = ['Duminică', 'Luni', 'Marți', 'Miercuri', 'Joi', 'Vineri', 'Sâmbătă'];
  const monthNames = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
  return `${dayNames[d.getDay()]}, ${d.getDate()} ${monthNames[d.getMonth()]}`;
}
