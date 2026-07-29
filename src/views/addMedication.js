import { saveMedication, getMedication, getTodayString } from '../db.js';
import { playNotificationSound, startRecording, stopRecording, playAudioBlob } from '../audio.js';

let currentStep = 1;
let isEditing = false;
let formData = {
  id: null,
  treatmentCategory: '',
  name: '',
  form: 'capsule',
  dosageValue: '1',
  dosageUnit: 'unitati',
  durationDays: 7,
  dosesPerDay: 2,
  times: ['08:00', '20:00'],
  mealReminder: true,
  criticalAlert: false,
  soundChoice: 'bell',
  isUnlimited: false,
  totalStock: 20,
  remainingStock: 20,
  voiceBlob: null,
  voiceDuration: 0
};

export async function renderAddMedication(container, navigateTo, editId = null) {
  currentStep = 1;
  isEditing = !!editId;

  if (editId) {
    const existing = await getMedication(editId);
    if (existing) {
      const isUnlim = existing.isUnlimited || existing.totalStock === 'unlimited';
      formData = {
        id: existing.id,
        treatmentCategory: existing.treatmentCategory || '',
        name: existing.name || '',
        form: existing.form || 'capsule',
        dosageValue: existing.dosageValue || '1',
        dosageUnit: existing.dosageUnit || 'unitati',
        durationDays: existing.durationDays || 7,
        dosesPerDay: existing.dosesPerDay || (existing.times ? existing.times.length : 2),
        times: existing.times || ['08:00', '20:00'],
        mealReminder: existing.mealReminder !== undefined ? existing.mealReminder : true,
        criticalAlert: existing.criticalAlert || false,
        soundChoice: existing.soundChoice || 'bell',
        isUnlimited: isUnlim,
        totalStock: isUnlim ? 'unlimited' : (existing.totalStock || 20),
        remainingStock: isUnlim ? 'unlimited' : (existing.remainingStock !== undefined ? existing.remainingStock : existing.totalStock || 20),
        startDate: existing.startDate || getTodayString(),
        voiceBlob: null,
        voiceDuration: 0
      };
    }
  } else {
    formData = {
      id: null,
      treatmentCategory: '',
      name: '',
      form: 'capsule',
      dosageValue: '1',
      dosageUnit: 'unitati',
      durationDays: 7,
      dosesPerDay: 2,
      times: ['08:00', '20:00'],
      mealReminder: true,
      criticalAlert: false,
      soundChoice: 'bell',
      isUnlimited: false,
      totalStock: 20,
      remainingStock: 20,
      startDate: getTodayString(),
      voiceBlob: null,
      voiceDuration: 0
    };
  }

  renderWizardStep(container, navigateTo);
}

function renderWizardStep(container, navigateTo) {
  const headerTitle = isEditing ? 'Editează tratamentul' : 'Adaugă un nou tratament';

  container.innerHTML = `
    <!-- Top App Bar -->
    <header class="sticky top-0 z-40 bg-background flex justify-between items-center px-container-margin py-stack-md border-b border-outline-variant/20">
      <div class="flex items-center gap-3">
        <button id="btn-back" class="w-10 h-10 flex items-center justify-center rounded-full hover:bg-surface-container-low transition-colors active:scale-95">
          <span class="material-symbols-outlined text-on-surface">arrow_back</span>
        </button>
        <h1 class="text-lg font-bold text-primary">${headerTitle}</h1>
      </div>
      <!-- Step Indicator Dots -->
      <div class="flex items-center gap-1.5">
        <div class="w-2.5 h-2.5 rounded-full transition-all ${currentStep === 1 ? 'bg-primary scale-110' : 'bg-surface-variant'}"></div>
        <div class="w-2.5 h-2.5 rounded-full transition-all ${currentStep === 2 ? 'bg-primary scale-110' : 'bg-surface-variant'}"></div>
        <div class="w-2.5 h-2.5 rounded-full transition-all ${currentStep === 3 ? 'bg-primary scale-110' : 'bg-surface-variant'}"></div>
      </div>
    </header>

    <main class="w-full max-w-md mx-auto px-container-margin mt-4 flex-1 pb-32">
      <!-- Progress Header Text -->
      <div class="mb-5">
        <p class="text-xs font-bold text-outline uppercase tracking-wider">Pasul ${currentStep} din 3</p>
        <p class="text-sm text-on-surface-variant mt-0.5">
          ${currentStep === 1 ? 'Definiți denumirea tratamentului, stocul și doza medicamentului.' : ''}
          ${currentStep === 2 ? 'Ajustați orele de administrare și durata tratamentului.' : ''}
          ${currentStep === 3 ? 'Actualizați sunetul, notificările și mesajul vocal.' : ''}
        </p>
      </div>

      ${currentStep === 1 ? renderStep1() : ''}
      ${currentStep === 2 ? renderStep2() : ''}
      ${currentStep === 3 ? renderStep3() : ''}
    </main>

    <!-- Bottom Fixed Action Bar -->
    <footer class="fixed bottom-0 left-0 right-0 p-container-margin bg-background/90 backdrop-blur-md flex justify-center z-40 border-t border-outline-variant/20">
      <div class="w-full max-w-md flex gap-3">
        ${currentStep > 1 ? `
          <button id="btn-prev" class="w-1/3 h-12 bg-surface-container-high text-on-surface font-semibold rounded-full hover:bg-surface-variant active:scale-95 transition-all">
            Înapoi
          </button>
        ` : ''}
        <button id="btn-next" class="flex-1 h-12 bg-primary text-on-primary font-semibold rounded-full shadow-lg hover:bg-primary-container active:scale-95 transition-all flex items-center justify-center gap-2">
          <span>${currentStep === 3 ? (isEditing ? 'Salvează Modificările' : 'Salvează & Activează') : 'Continuă'}</span>
          <span class="material-symbols-outlined">${currentStep === 3 ? 'check_circle' : 'arrow_forward'}</span>
        </button>
      </div>
    </footer>
  `;

  attachStepEvents(container, navigateTo);
}

function renderStep1() {
  return `
    <div class="space-y-4">
      <!-- Category / Treatment Name -->
      <div class="space-y-1">
        <label for="treatment_category" class="text-xs font-bold text-on-surface ml-1">Nume Tratament / Diagnostic (Opțional)</label>
        <input id="treatment_category" type="text" value="${formData.treatmentCategory}" placeholder="Ex: Gripă, Hepatită, Tensiune, Tratament 1..."
          class="w-full h-13 px-4 bg-surface-container-lowest border border-outline-variant rounded-2xl text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all" />
        <p class="text-[11px] text-outline px-1">Puteți grupa medicamentele pe tratamente (ex: Gripă, Tensiune).</p>
      </div>

      <!-- Medication Name Free Input -->
      <div class="space-y-1">
        <label for="med_name" class="text-xs font-bold text-on-surface ml-1">Denumire Medicament / Sirop *</label>
        <input id="med_name" type="text" value="${formData.name}" placeholder="Introduceți orice denumire (ex: Sirop tuse, Comprimat A...)"
          class="w-full h-14 px-4 bg-surface-container-lowest border border-outline-variant rounded-2xl text-base font-semibold focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all" />
      </div>

      <!-- Form Selection Grid -->
      <div class="space-y-1.5 pt-1">
        <label class="text-xs font-bold text-on-surface ml-1">Forma farmaceutică</label>
        <div class="grid grid-cols-2 gap-3">
          ${[
            { id: 'capsule', label: 'Capsulă', icon: 'pill' },
            { id: 'tablet', label: 'Comprimat', icon: 'medication' },
            { id: 'liquid', label: 'Lichid / Sirop', icon: 'vaccines' },
            { id: 'injection', label: 'Injecție', icon: 'syringe' }
          ].map(item => `
            <label class="cursor-pointer group">
              <input type="radio" name="form_choice" value="${item.id}" ${formData.form === item.id ? 'checked' : ''} class="peer sr-only" />
              <div class="flex flex-col items-center justify-center p-3.5 rounded-2xl bg-surface-container-lowest border-2 border-outline-variant peer-checked:border-primary peer-checked:bg-primary-fixed/30 hover:bg-surface-container-low transition-all h-26">
                <span class="material-symbols-outlined text-3xl text-on-surface-variant group-hover:scale-110 transition-transform mb-1">${item.icon}</span>
                <span class="text-xs font-bold text-on-surface">${item.label}</span>
              </div>
            </label>
          `).join('')}
        </div>
      </div>

      <!-- Dosage & Unit -->
      <div class="grid grid-cols-2 gap-3">
        <div class="space-y-1">
          <label for="dosage_val" class="text-xs font-bold text-on-surface ml-1">Cantitate per doză</label>
          <input id="dosage_val" type="number" min="1" value="${formData.dosageValue}"
            class="w-full h-13 px-4 bg-surface-container-lowest border border-outline-variant rounded-2xl text-center text-base font-bold focus:border-primary outline-none" />
        </div>
        <div class="space-y-1">
          <label for="dosage_unit" class="text-xs font-bold text-on-surface ml-1">Unitate</label>
          <select id="dosage_unit" class="w-full h-13 px-3 bg-surface-container-lowest border border-outline-variant rounded-2xl text-xs font-semibold focus:border-primary outline-none">
            <option value="unitati" ${formData.dosageUnit === 'unitati' ? 'selected' : ''}>Pastilă/Doză</option>
            <option value="mg" ${formData.dosageUnit === 'mg' ? 'selected' : ''}>Miligrame (mg)</option>
            <option value="ml" ${formData.dosageUnit === 'ml' ? 'selected' : ''}>Mililitri (ml)</option>
            <option value="drops" ${formData.dosageUnit === 'drops' ? 'selected' : ''}>Picături</option>
          </select>
        </div>
      </div>

      <!-- Stock Input & Unlimited Checkbox -->
      <div class="bg-surface-container-lowest p-3.5 rounded-2xl border border-outline-variant/40 shadow-sm space-y-2">
        <div class="flex justify-between items-center">
          <label for="total_stock" class="text-xs font-bold text-on-surface">Stoc disponibil inițial (doze)</label>
          <label class="inline-flex items-center gap-1.5 cursor-pointer text-xs text-primary font-bold">
            <input type="checkbox" id="chk_unlimited_stock" ${formData.isUnlimited ? 'checked' : ''} class="w-4 h-4 text-primary rounded" />
            <span>Stoc Nelimitat (∞)</span>
          </label>
        </div>

        <input id="total_stock" type="number" min="1" value="${formData.isUnlimited ? '' : (formData.totalStock !== 'unlimited' ? formData.totalStock : 20)}" ${formData.isUnlimited ? 'disabled placeholder="Stocul este nelimitat"' : 'placeholder="Ex: 30"'}
          class="w-full h-12 px-4 bg-background border border-outline-variant rounded-xl text-sm font-semibold focus:border-primary outline-none disabled:opacity-50 disabled:bg-surface-container-low transition-all" />
      </div>
    </div>
  `;
}

function renderStep2() {
  return `
    <div class="space-y-5">
      <!-- Duration Section -->
      <div class="bg-surface-container-lowest p-4 rounded-2xl border border-outline-variant/40 shadow-sm space-y-3">
        <label class="text-xs font-bold text-primary uppercase tracking-wider block">Durata tratamentului</label>
        <div class="grid grid-cols-3 gap-2">
          <button type="button" data-duration="7" class="btn-duration flex flex-col items-center justify-center p-3 border-2 ${formData.durationDays === 7 ? 'border-primary bg-primary-fixed/20 text-primary' : 'border-outline-variant text-on-surface'} rounded-2xl active:scale-95 transition-all">
            <span class="text-lg font-bold">7</span>
            <span class="text-xs">Zile</span>
          </button>
          <button type="button" data-duration="30" class="btn-duration flex flex-col items-center justify-center p-3 border-2 ${formData.durationDays === 30 ? 'border-primary bg-primary-fixed/20 text-primary' : 'border-outline-variant text-on-surface'} rounded-2xl active:scale-95 transition-all">
            <span class="text-lg font-bold">1</span>
            <span class="text-xs">Lună</span>
          </button>
          <button type="button" data-duration="365" class="btn-duration flex flex-col items-center justify-center p-3 border-2 ${formData.durationDays === 365 ? 'border-primary bg-primary-fixed/20 text-primary' : 'border-outline-variant text-on-surface'} rounded-2xl active:scale-95 transition-all">
            <span class="material-symbols-outlined">all_inclusive</span>
            <span class="text-xs">Permanent</span>
          </button>
        </div>
      </div>

      <!-- Doses Per Day -->
      <div class="bg-surface-container-lowest p-4 rounded-2xl border border-outline-variant/40 shadow-sm space-y-4">
        <div class="flex justify-between items-center">
          <label class="text-xs font-bold text-primary uppercase tracking-wider">Doze pe zi</label>
          <div class="flex items-center gap-3 bg-surface-container rounded-full px-2 py-1">
            <button type="button" id="btn-dec-doses" class="w-8 h-8 rounded-full bg-surface-container-lowest flex items-center justify-center text-primary active:scale-90 transition-all font-bold">-</button>
            <span id="doses-count-disp" class="text-lg font-bold w-6 text-center">${formData.dosesPerDay}</span>
            <button type="button" id="btn-inc-doses" class="w-8 h-8 rounded-full bg-surface-container-lowest flex items-center justify-center text-primary active:scale-90 transition-all font-bold">+</button>
          </div>
        </div>

        <!-- Dynamic Time Pickers -->
        <div id="times-picker-container" class="space-y-2.5 pt-2">
          ${formData.times.map((t, idx) => `
            <div class="flex items-center justify-between p-3 bg-surface-container-low rounded-xl border border-outline-variant/30">
              <div class="flex items-center gap-3">
                <span class="material-symbols-outlined text-primary">schedule</span>
                <span class="text-sm font-semibold text-on-surface">Doză ${idx + 1}</span>
              </div>
              <input type="time" data-time-index="${idx}" value="${t}" class="time-input bg-transparent border-none text-base font-bold text-primary focus:ring-0 cursor-pointer" />
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Meal Switch -->
      <div class="bg-surface-container-lowest p-4 rounded-2xl border border-outline-variant/40 shadow-sm flex justify-between items-center">
        <div class="space-y-0.5">
          <div class="flex items-center gap-2">
            <span class="material-symbols-outlined text-secondary">restaurant</span>
            <span class="text-sm font-bold text-on-surface">Memento înainte de masă</span>
          </div>
          <p class="text-xs text-on-surface-variant">Alertă cu 30 minute înainte de masă.</p>
        </div>
        <label class="relative inline-flex items-center cursor-pointer">
          <input type="checkbox" id="chk-meal" ${formData.mealReminder ? 'checked' : ''} class="sr-only peer" />
          <div class="w-12 h-6 bg-surface-container-highest rounded-full peer-checked:bg-primary transition-all relative after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-6"></div>
        </label>
      </div>
    </div>
  `;
}

function renderStep3() {
  const sounds = [
    { id: 'bell', name: 'Clopoțel (Default)', desc: 'Clar, blând și cristalin' },
    { id: 'vital', name: 'Puls Vital', desc: 'Bip ritmic și constant' },
    { id: 'alert', name: 'Alertă Medicală', desc: 'Ton urgent și persistent' },
    { id: 'zen', name: 'Zen Bowl', desc: 'Melodie calmantă și relaxantă' },
    { id: 'echo', name: 'Digital Echo', desc: 'Sunet sintetic modern' }
  ];

  return `
    <div class="space-y-5">
      <!-- Sound Selection -->
      <div class="space-y-2">
        <label class="text-xs font-bold text-outline uppercase tracking-wider px-1">Sunet Notificare</label>
        <div class="space-y-2">
          ${sounds.map(s => `
            <label class="flex items-center justify-between bg-surface-container-lowest p-3.5 rounded-2xl border-2 ${formData.soundChoice === s.id ? 'border-primary bg-primary-fixed/10' : 'border-outline-variant/30'} cursor-pointer transition-all">
              <div class="flex items-center gap-3">
                <button type="button" data-sound="${s.id}" class="btn-preview-sound w-9 h-9 flex items-center justify-center bg-primary-fixed rounded-full text-primary hover:scale-105 active:scale-95 transition-all">
                  <span class="material-symbols-outlined text-xl">play_arrow</span>
                </button>
                <div>
                  <p class="text-sm font-bold text-on-surface">${s.name}</p>
                  <p class="text-xs text-on-surface-variant">${s.desc}</p>
                </div>
              </div>
              <input type="radio" name="sound_choice" value="${s.id}" ${formData.soundChoice === s.id ? 'checked' : ''} class="w-5 h-5 text-primary" />
            </label>
          `).join('')}
        </div>
      </div>

      <!-- Voice Memo Card -->
      <div class="bg-surface-container-lowest p-4 rounded-2xl border border-outline-variant/40 shadow-sm space-y-3">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 bg-tertiary-fixed rounded-full flex items-center justify-center text-tertiary">
            <span class="material-symbols-outlined">mic</span>
          </div>
          <div>
            <h3 class="text-sm font-bold text-on-surface">Înregistrează Memento Vocal</h3>
            <p class="text-xs text-on-surface-variant">Înregistrează propriul tău mesaj audio</p>
          </div>
        </div>

        <div class="flex items-center justify-between pt-2">
          <button type="button" id="btn-record-voice" class="px-4 py-2.5 bg-tertiary text-on-tertiary text-xs font-bold rounded-xl flex items-center gap-2 hover:bg-tertiary-container transition-all active:scale-95">
            <span class="material-symbols-outlined text-sm" id="rec-icon">mic</span>
            <span id="rec-status-text">${formData.voiceBlob ? 'Re-înregistrează' : 'Începe Înregistrarea'}</span>
          </button>

          ${formData.voiceBlob ? `
            <button type="button" id="btn-play-voice" class="px-3 py-2 bg-surface-container-high text-primary text-xs font-bold rounded-xl flex items-center gap-1.5 hover:bg-surface-container transition-all">
              <span class="material-symbols-outlined text-sm">play_arrow</span>
              <span>Ascultă (${formData.voiceDuration}s)</span>
            </button>
          ` : ''}
        </div>
      </div>

      <!-- Critical Alerts Toggle -->
      <div class="bg-surface-container-lowest p-4 rounded-2xl border-2 border-error/20 shadow-sm flex justify-between items-center">
        <div class="space-y-0.5 pr-2">
          <div class="flex items-center gap-2">
            <span class="material-symbols-outlined text-error">priority_high</span>
            <span class="text-sm font-bold text-on-surface">Alerte Critice</span>
          </div>
          <p class="text-xs text-on-surface-variant">Sunetul va fi redat chiar dacă telefonul este silențios.</p>
        </div>
        <label class="relative inline-flex items-center cursor-pointer">
          <input type="checkbox" id="chk-critical" ${formData.criticalAlert ? 'checked' : ''} class="sr-only peer" />
          <div class="w-12 h-6 bg-surface-container-highest rounded-full peer-checked:bg-error transition-all relative after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-6"></div>
        </label>
      </div>
    </div>
  `;
}

function attachStepEvents(container, navigateTo) {
  const btnBack = container.querySelector('#btn-back');
  if (btnBack) {
    btnBack.addEventListener('click', () => {
      if (currentStep > 1) {
        currentStep--;
        renderWizardStep(container, navigateTo);
      } else {
        navigateTo('dashboard');
      }
    });
  }

  const btnPrev = container.querySelector('#btn-prev');
  if (btnPrev) {
    btnPrev.addEventListener('click', () => {
      currentStep--;
      renderWizardStep(container, navigateTo);
    });
  }

  const btnNext = container.querySelector('#btn-next');
  if (btnNext) {
    btnNext.addEventListener('click', async () => {
      if (currentStep === 1) {
        const inputName = container.querySelector('#med_name');
        const inputCat = container.querySelector('#treatment_category');
        const chkUnlim = container.querySelector('#chk_unlimited_stock');
        const inputStock = container.querySelector('#total_stock');

        if (!inputName || !inputName.value.trim()) {
          alert('Te rugăm să introduci denumirea medicamentului sau siropului!');
          return;
        }

        formData.name = inputName.value.trim();
        formData.treatmentCategory = inputCat ? inputCat.value.trim() : '';
        formData.dosageValue = container.querySelector('#dosage_val').value || '1';
        formData.dosageUnit = container.querySelector('#dosage_unit').value;

        formData.isUnlimited = chkUnlim ? chkUnlim.checked : false;
        if (formData.isUnlimited) {
          formData.totalStock = 'unlimited';
          formData.remainingStock = 'unlimited';
        } else {
          const userTypedStock = parseInt(inputStock ? inputStock.value : '20', 10);
          const validStock = isNaN(userTypedStock) || userTypedStock < 1 ? 20 : userTypedStock;
          
          formData.totalStock = validStock;
          formData.remainingStock = validStock;
        }

        currentStep = 2;
        renderWizardStep(container, navigateTo);
      } else if (currentStep === 2) {
        currentStep = 3;
        renderWizardStep(container, navigateTo);
      } else if (currentStep === 3) {
        let formLabel = 'Comprimat';
        let icon = 'medication';
        let colorBg = 'bg-primary-fixed';
        let colorText = 'text-primary';

        if (formData.form === 'capsule') {
          formLabel = 'Capsulă';
          icon = 'pill';
          colorBg = 'bg-secondary-container';
          colorText = 'text-on-secondary-container';
        } else if (formData.form === 'liquid') {
          formLabel = 'Lichid / Sirop';
          icon = 'vaccines';
          colorBg = 'bg-tertiary-fixed';
          colorText = 'text-tertiary';
        } else if (formData.form === 'injection') {
          formLabel = 'Injecție';
          icon = 'syringe';
          colorBg = 'bg-error-container';
          colorText = 'text-error';
        }

        const isUnlim = formData.isUnlimited || formData.totalStock === 'unlimited';

        const medToSave = {
          name: formData.name,
          treatmentCategory: formData.treatmentCategory || 'General',
          form: formData.form,
          formLabel,
          dosageValue: formData.dosageValue,
          dosageUnit: formData.dosageUnit,
          dosageDisplay: `${formData.dosageValue} ${formData.dosageUnit === 'unitati' ? 'doze' : formData.dosageUnit}`,
          durationDays: formData.durationDays,
          dosesPerDay: formData.dosesPerDay,
          times: formData.times,
          mealReminder: formData.mealReminder,
          criticalAlert: formData.criticalAlert,
          soundChoice: formData.soundChoice,
          isUnlimited: isUnlim,
          totalStock: isUnlim ? 'unlimited' : formData.totalStock,
          remainingStock: isUnlim ? 'unlimited' : formData.remainingStock,
          startDate: formData.startDate || getTodayString(),
          icon,
          colorBg,
          colorText
        };

        if (formData.id) {
          medToSave.id = formData.id;
        }

        await saveMedication(medToSave);
        playNotificationSound('bell', 70);
        navigateTo('cabinet');
      }
    });
  }

  // Step 1 Checkbox Listener for Unlimited Stock
  if (currentStep === 1) {
    const chkUnlim = container.querySelector('#chk_unlimited_stock');
    const inputStock = container.querySelector('#total_stock');

    if (chkUnlim && inputStock) {
      chkUnlim.addEventListener('change', (e) => {
        formData.isUnlimited = e.target.checked;
        if (e.target.checked) {
          inputStock.disabled = true;
          inputStock.value = '';
          inputStock.placeholder = 'Stocul este nelimitat';
        } else {
          inputStock.disabled = false;
          inputStock.value = typeof formData.totalStock === 'number' ? formData.totalStock : 20;
          inputStock.placeholder = 'Ex: 30';
        }
      });
    }

    container.querySelectorAll('input[name="form_choice"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        formData.form = e.target.value;
      });
    });
  }

  // Step 2 Listeners
  if (currentStep === 2) {
    container.querySelectorAll('.btn-duration').forEach(btn => {
      btn.addEventListener('click', () => {
        formData.durationDays = Number(btn.getAttribute('data-duration'));
        renderWizardStep(container, navigateTo);
      });
    });

    const btnInc = container.querySelector('#btn-inc-doses');
    const btnDec = container.querySelector('#btn-dec-doses');

    if (btnInc) {
      btnInc.addEventListener('click', () => {
        if (formData.dosesPerDay < 6) {
          formData.dosesPerDay++;
          formData.times.push('12:00');
          renderWizardStep(container, navigateTo);
        }
      });
    }

    if (btnDec) {
      btnDec.addEventListener('click', () => {
        if (formData.dosesPerDay > 1) {
          formData.dosesPerDay--;
          formData.times.pop();
          renderWizardStep(container, navigateTo);
        }
      });
    }

    container.querySelectorAll('.time-input').forEach(input => {
      input.addEventListener('change', (e) => {
        const idx = Number(e.target.getAttribute('data-time-index'));
        formData.times[idx] = e.target.value;
      });
    });

    const chkMeal = container.querySelector('#chk-meal');
    if (chkMeal) {
      chkMeal.addEventListener('change', (e) => {
        formData.mealReminder = e.target.checked;
      });
    }
  }

  // Step 3 Listeners
  if (currentStep === 3) {
    container.querySelectorAll('.btn-preview-sound').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const sName = btn.getAttribute('data-sound');
        playNotificationSound(sName, 75);
      });
    });

    container.querySelectorAll('input[name="sound_choice"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        formData.soundChoice = e.target.value;
      });
    });

    const chkCritical = container.querySelector('#chk-critical');
    if (chkCritical) {
      chkCritical.addEventListener('change', (e) => {
        formData.criticalAlert = e.target.checked;
      });
    }

    let recording = false;
    const btnRecord = container.querySelector('#btn-record-voice');
    if (btnRecord) {
      btnRecord.addEventListener('click', async () => {
        if (!recording) {
          try {
            await startRecording();
            recording = true;
            btnRecord.querySelector('#rec-icon').innerText = 'stop';
            btnRecord.querySelector('#rec-status-text').innerText = 'Se înregistrează... (Apasă STOP)';
            btnRecord.classList.replace('bg-tertiary', 'bg-error');
          } catch (err) {
            alert('Eroare accesare microfon: ' + err.message);
          }
        } else {
          const res = await stopRecording();
          recording = false;
          if (res) {
            formData.voiceBlob = res.blob;
            formData.voiceDuration = res.durationSeconds;
          }
          renderWizardStep(container, navigateTo);
        }
      });
    }

    const btnPlayVoice = container.querySelector('#btn-play-voice');
    if (btnPlayVoice && formData.voiceBlob) {
      btnPlayVoice.addEventListener('click', () => {
        playAudioBlob(formData.voiceBlob);
      });
    }
  }
}
