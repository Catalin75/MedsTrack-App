import { getMedications, deleteMedication, saveMedication } from '../db.js';

export async function renderCabinet(container, navigateTo) {
  const meds = await getMedications();

  container.innerHTML = `
    <!-- Top App Bar -->
    <header class="sticky top-0 z-40 bg-background/95 backdrop-blur-md flex justify-between items-center px-container-margin py-stack-md border-b border-outline-variant/20">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-full bg-primary-fixed flex items-center justify-center text-primary font-bold">
          <span class="material-symbols-outlined">medical_services</span>
        </div>
        <div>
          <p class="text-xs text-on-surface-variant font-medium">Tratamentele Mele</p>
          <h1 class="text-lg font-bold text-primary">Dulapul Virtual</h1>
        </div>
      </div>
      <div class="px-3 py-1 bg-surface-container-high rounded-full text-xs font-bold text-on-surface-variant">
        ${meds.length} Active
      </div>
    </header>

    <main class="px-container-margin max-w-md mx-auto w-full flex-1 mt-4 pb-32">
      <div class="mb-4">
        <h2 class="text-lg font-bold text-on-surface">Medicația Activă</h2>
        <p class="text-xs text-on-surface-variant">Gestionează, editează sau reumple stocul fiecărui tratament.</p>
      </div>

      <div class="space-y-4">
        ${meds.length === 0 ? `
          <div class="text-center py-12 bg-surface-container-lowest rounded-2xl p-6 border border-dashed border-outline-variant">
            <span class="material-symbols-outlined text-4xl text-outline mb-2">pill</span>
            <p class="text-sm font-bold text-on-surface">Nu ai niciun tratament configurat.</p>
            <p class="text-xs text-outline mt-1 mb-4">Apasă butonul + pentru a adăuga primul tău tratament.</p>
            <button id="btn-empty-add" class="px-5 py-2.5 bg-primary text-on-primary font-bold text-xs rounded-full shadow-md hover:bg-primary-container">
              + Adaugă Tratament
            </button>
          </div>
        ` : meds.map(med => renderCabinetCard(med)).join('')}
      </div>
    </main>

    <!-- FAB: Add Quick -->
    <button id="fab-add-cabinet" class="fixed bottom-20 right-5 w-14 h-14 bg-primary text-on-primary rounded-full shadow-xl flex items-center justify-center active:scale-90 transition-transform z-40 hover:bg-primary-container">
      <span class="material-symbols-outlined text-[32px]">add</span>
    </button>
  `;

  // Attach Event Listeners
  const btnAdd = container.querySelector('#fab-add-cabinet');
  if (btnAdd) btnAdd.addEventListener('click', () => navigateTo('addMedication'));

  const btnEmptyAdd = container.querySelector('#btn-empty-add');
  if (btnEmptyAdd) btnEmptyAdd.addEventListener('click', () => navigateTo('addMedication'));

  // Edit Treatment Buttons
  container.querySelectorAll('.btn-edit-med').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.getAttribute('data-id'));
      navigateTo('editMedication', { editId: id });
    });
  });

  // Refill Stock Buttons
  container.querySelectorAll('.btn-refill').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = Number(btn.getAttribute('data-id'));
      const med = meds.find(m => m.id === id);
      if (med) {
        if (med.isUnlimited || med.totalStock === 'unlimited') {
          alert(`Tratamentul "${med.name}" are stoc setat pe Nelimitat.`);
          return;
        }

        const added = prompt(`Câte doze dorești să adaugi la stocul curent (${med.remainingStock} doze)?`, '20');
        if (added && !isNaN(added)) {
          const currentRem = typeof med.remainingStock === 'number' ? med.remainingStock : 0;
          const currentTot = typeof med.totalStock === 'number' ? med.totalStock : 20;
          const addVal = parseInt(added, 10);

          med.remainingStock = currentRem + addVal;
          med.totalStock = Math.max(currentTot, med.remainingStock);

          await saveMedication(med);
          renderCabinet(container, navigateTo);
        }
      }
    });
  });

  // Delete Medication Buttons
  container.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = Number(btn.getAttribute('data-id'));
      const med = meds.find(m => m.id === id);
      if (med && confirm(`Sigur dorești să ștergi tratamentul "${med.name}"?`)) {
        await deleteMedication(id);
        renderCabinet(container, navigateTo);
      }
    });
  });
}

function renderCabinetCard(med) {
  const isUnlimited = med.isUnlimited || med.totalStock === 'unlimited';
  const totStk = isUnlimited ? 'unlimited' : (typeof med.totalStock === 'number' ? med.totalStock : parseInt(med.totalStock || '20', 10));
  const remStk = isUnlimited ? 'unlimited' : (typeof med.remainingStock === 'number' ? med.remainingStock : totStk);

  const isLowStock = !isUnlimited && typeof remStk === 'number' && remStk <= 5;
  const progressPercent = isUnlimited ? 100 : Math.min(100, Math.max(0, Math.round((remStk / (totStk || 1)) * 100)));

  return `
    <div class="glass-card border border-outline-variant/40 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all space-y-3">
      <div class="flex justify-between items-start">
        <div class="flex items-center gap-3">
          <div class="w-12 h-12 rounded-xl ${med.colorBg || 'bg-primary-fixed'} flex items-center justify-center ${med.colorText || 'text-primary'} shrink-0">
            <span class="material-symbols-outlined text-[26px]">${med.icon || 'pill'}</span>
          </div>
          <div>
            <div class="flex items-center gap-2">
              <h3 class="text-base font-bold text-on-surface">${med.name}</h3>
              ${med.treatmentCategory ? `
                <span class="text-[10px] bg-secondary-container/50 text-on-secondary-container px-2 py-0.5 rounded-full font-bold">
                  ${med.treatmentCategory}
                </span>
              ` : ''}
            </div>
            <span class="inline-flex items-center px-2 py-0.5 rounded-md bg-surface-container-high text-on-surface-variant text-xs font-medium mt-1">
              ${med.mealReminder ? 'Înainte de masă' : 'Fără restricție alimentară'}
            </span>
          </div>
        </div>
        <div class="text-right">
          <p class="text-[11px] text-outline font-medium">Ore admn.</p>
          <p class="text-xs font-bold text-primary">${med.times ? med.times.join(', ') : ''}</p>
        </div>
      </div>

      <!-- Stock Info & Progress -->
      <div class="space-y-2 pt-1">
        <div class="flex justify-between items-center text-xs">
          <span class="text-on-surface-variant">Stoc disponibil</span>
          <span class="font-bold ${isUnlimited ? 'text-primary' : (isLowStock ? 'text-error animate-pulse' : 'text-on-surface')} flex items-center gap-1">
            ${isUnlimited
              ? '<span class="material-symbols-outlined text-sm">all_inclusive</span> Nelimitat (∞)'
              : `${remStk} doze rămase (din ${totStk}) ${isLowStock ? '(Scăzut!)' : ''}`
            }
          </span>
        </div>

        <div class="w-full h-2 bg-surface-container-highest rounded-full overflow-hidden">
          <div class="h-full ${isUnlimited ? 'bg-primary' : (isLowStock ? 'bg-error' : 'bg-secondary')} rounded-full transition-all duration-700" style="width: ${progressPercent}%;"></div>
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="flex justify-between items-center pt-2 border-t border-outline-variant/20 text-xs font-bold">
        <button data-id="${med.id}" class="btn-edit-med flex items-center gap-1 text-primary hover:underline">
          <span class="material-symbols-outlined text-sm">edit</span>
          <span>Editează</span>
        </button>

        ${!isUnlimited ? `
          <button data-id="${med.id}" class="btn-refill flex items-center gap-1 text-secondary hover:underline">
            <span class="material-symbols-outlined text-sm">add_shopping_cart</span>
            <span>Reumple stoc</span>
          </button>
        ` : '<div></div>'}

        <button data-id="${med.id}" class="btn-delete flex items-center gap-1 text-error/80 hover:text-error hover:underline">
          <span class="material-symbols-outlined text-sm">delete</span>
          <span>Șterge</span>
        </button>
      </div>
    </div>
  `;
}
