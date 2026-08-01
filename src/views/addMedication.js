import { saveMedication, getMedication, getTodayString } from '../db.js';
import { playNotificationSound, startRecording, stopRecording, playAudioBlob } from '../audio.js';

let currentStep = 1;
let isEditing = false;
let formData = {
  id: null,
  treatmentCategory: '',
  name: '',
  medications: [],
  durationDays: 7,
  isCustomDuration: false,
  dosesPerDay: 2,
  times: ['08:00', '20:00'],
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
      
      const loadedMeds = (existing.medications && Array.isArray(existing.medications) && existing.medications.length > 0)
        ? existing.medications
        : [
            {
              id: 'med_1',
              name: existing.name || '',
              form: existing.form || 'capsule',
              dosageValue: existing.dosageValue || '1',
              dosageUnit: existing.dosageUnit || 'unitati',
              isUnlimited: isUnlim,
              totalStock: isUnlim ? 'unlimited' : (existing.totalStock || 20),
              remainingStock: isUnlim ? 'unlimited' : (existing.remainingStock !== undefined ? existing.remainingStock : existing.totalStock || 20)
            }
          ];

      formData = {
        id: existing.id,
        treatmentCategory: existing.treatmentCategory || '',
        name: existing.name || loadedMeds[0].name || '',
        medications: loadedMeds,
        durationDays: existing.durationDays || 7,
        isCustomDuration: existing.durationDays !== 7 && existing.durationDays !== 30,
        dosesPerDay: existing.dosesPerDay || (existing.times ? existing.times.length : 2),
        times: existing.times || ['08:00', '20:00'],
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
      medications: [
        {
          id: 'med_1',
          name: '',
          form: 'capsule',
          dosageValue: '1',
          dosageUnit: 'unitati',
          isUnlimited: false,
          totalStock: 20,
          remainingStock: 20
        }
      ],
      durationDays: 7,
      isCustomDuration: false,
      dosesPerDay: 2,
      times: ['08:00', '20:00'],
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
          ${currentStep === 1 ? 'Definiți denumirea tratamentului și pastilele incluse.' : ''}
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
    <div class="space-y-5">
      <!-- Category / Treatment Name -->
      <div class="space-y-1">
        <label for="treatment_category" class="text-xs font-bold text-on-surface ml-1">Nume Tratament / Diagnostic *</label>
        <input id="treatment_category" type="text" value="${formData.treatmentCategory}" placeholder="Ex: Tratament Gripă, Cardio, Tratament 1..."
          class="w-full h-13 px-4 bg-surface-container-lowest border border-outline-variant rounded-2xl text-sm font-semibold focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all" />
      </div>

      <!-- Dynamic List of Medications in this Treatment -->
      <div class="space-y-4">
        <div class="flex items-center justify-between px-1">
          <h2 class="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1">
            <span class="material-symbols-outlined text-sm">pill</span>
            <span>Medicamente incluse în acest tratament (${formData.medications.length})</span>
          </h2>
        </div>

        ${formData.medications.map((medItem, idx) => `
          <div class="med-item-card bg-surface-container-lowest p-4 rounded-3xl border-2 border-outline-variant/40 shadow-sm space-y-3 relative" data-med-index="${idx}">
            <div class="flex items-center justify-between border-b border-outline-variant/20 pb-2">
              <span class="text-xs font-extrabold text-primary uppercase">Medicamentul #${idx + 1}</span>
              ${formData.medications.length > 1 ? `
                <button type="button" data-remove-index="${idx}" class="btn-remove-med text-error hover:text-error text-xs font-bold flex items-center gap-0.5">
                  <span class="material-symbols-outlined text-sm">delete</span>
                  <span>Șterge</span>
                </button>
              ` : ''}
            </div>

            <!-- Name -->
            <div class="space-y-1">
              <label class="text-xs font-bold text-on-surface ml-1">Denumire Medicament / Sirop *</label>
              <input type="text" data-med-field="name" data-med-index="${idx}" value="${medItem.name}" placeholder="Ex: Amoxicilină 500mg, Paracetamol..."
                class="input-med-field w-full h-12 px-4 bg-background border border-outline-variant rounded-xl text-sm font-bold focus:border-primary outline-none" />
            </div>

            <!-- Form Selection Grid -->
            <div class="space-y-1">
              <label class="text-xs font-bold text-on-surface ml-1">Forma farmaceutică</label>
              <div class="grid grid-cols-2 gap-2">
                ${[
                  { id: 'capsule', label: 'Capsulă', icon: 'pill' },
                  { id: 'tablet', label: 'Comprimat', icon: 'medication' },
                  { id: 'liquid', label: 'Lichid / Sirop', icon: 'vaccines' },
                  { id: 'injection', label: 'Injecție', icon: 'syringe' }
                ].map(item => `
                  <label class="cursor-pointer">
                    <input type="radio" name="form_choice_${idx}" value="${item.id}" ${medItem.form === item.id ? 'checked' : ''} data-med-index="${idx}" class="radio-med-form sr-only peer" />
                    <div class="flex items-center gap-2 p-2.5 rounded-xl bg-background border border-outline-variant peer-checked:border-primary peer-checked:bg-primary-fixed/20 transition-all">
                      <span class="material-symbols-outlined text-xl text-primary">${item.icon}</span>
                      <span class="text-xs font-bold text-on-surface">${item.label}</span>
                    </div>
                  </label>
                `).join('')}
              </div>
            </div>

            <!-- Dosage & Unit -->
            <div class="grid grid-cols-2 gap-2">
              <div class="space-y-1">
                <label class="text-xs font-bold text-on-surface ml-1">Cantitate / Doză</label>
                <input type="number" min="1" data-med-field="dosageValue" data-med-index="${idx}" value="${medItem.dosageValue || '1'}"
                  class="input-med-field w-full h-11 px-3 bg-background border border-outline-variant rounded-xl text-center text-sm font-bold focus:border-primary outline-none" />
              </div>
              <div class="space-y-1">
                <label class="text-xs font-bold text-on-surface ml-1">Unitate</label>
                <select data-med-field="dosageUnit" data-med-index="${idx}" class="select-med-field w-full h-11 px-2 bg-background border border-outline-variant rounded-xl text-xs font-bold focus:border-primary outline-none">
                  <option value="unitati" ${medItem.dosageUnit === 'unitati' ? 'selected' : ''}>Pastilă/Doză</option>
                  <option value="mg" ${medItem.dosageUnit === 'mg' ? 'selected' : ''}>Miligrame (mg)</option>
                  <option value="ml" ${medItem.dosageUnit === 'ml' ? 'selected' : ''}>Mililitri (ml)</option>
                  <option value="drops" ${medItem.dosageUnit === 'drops' ? 'selected' : ''}>Picături</option>
                </select>
              </div>
            </div>

            <!-- Stock Input & Unlimited Checkbox -->
            <div class="bg-background p-3 rounded-xl border border-outline-variant/30 space-y-2">
              <div class="flex justify-between items-center">
                <label class="text-xs font-bold text-on-surface">Stoc disponibil (doze)</label>
                <label class="inline-flex items-center gap-1 cursor-pointer text-xs text-primary font-bold">
                  <input type="checkbox" data-med-index="${idx}" ${medItem.isUnlimited ? 'checked' : ''} class="chk-med-unlimited w-4 h-4 text-primary rounded" />
                  <span>Stoc Nelimitat (∞)</span>
                </label>
              </div>

              ${!medItem.isUnlimited ? `
                <input type="number" min="1" data-med-field="totalStock" data-med-index="${idx}" value="${typeof medItem.totalStock === 'number' ? medItem.totalStock : 20}" placeholder="Ex: 30"
                  class="input-med-field w-full h-11 px-3 bg-surface-container-lowest border border-outline-variant rounded-xl text-sm font-bold focus:border-primary outline-none" />
              ` : ''}
            </div>
          </div>
        `).join('')}

        <!-- Add Another Medication Button -->
        <button type="button" id="btn-add-another-med" class="w-full py-3.5 bg-primary-fixed/30 text-primary border-2 border-dashed border-primary/40 rounded-2xl text-xs font-extrabold flex items-center justify-center gap-2 hover:bg-primary-fixed/60 active:scale-95 transition-all">
          <span class="material-symbols-outlined text-lg">add_circle</span>
          <span>+ Adaugă încă un medicament în acest tratament</span>
        </button>
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
          <button type="button" data-duration="7" class="btn-duration flex flex-col items-center justify-center p-3 border-2 ${!formData.isCustomDuration && formData.durationDays === 7 ? 'border-primary bg-primary-fixed/20 text-primary' : 'border-outline-variant text-on-surface'} rounded-2xl active:scale-95 transition-all">
            <span class="text-lg font-bold">7</span>
            <span class="text-xs font-semibold">Zile</span>
          </button>
          <button type="button" data-duration="30" class="btn-duration flex flex-col items-center justify-center p-3 border-2 ${!formData.isCustomDuration && formData.durationDays === 30 ? 'border-primary bg-primary-fixed/20 text-primary' : 'border-outline-variant text-on-surface'} rounded-2xl active:scale-95 transition-all">
            <span class="text-lg font-bold">30</span>
            <span class="text-xs font-semibold">Zile (1 Lună)</span>
          </button>
          <button type="button" data-duration="custom" class="btn-duration flex flex-col items-center justify-center p-3 border-2 ${formData.isCustomDuration || (formData.durationDays !== 7 && formData.durationDays !== 30) ? 'border-primary bg-primary-fixed/20 text-primary' : 'border-outline-variant text-on-surface'} rounded-2xl active:scale-95 transition-all">
            <span class="material-symbols-outlined text-primary">edit_calendar</span>
            <span class="text-xs font-bold">Personalizat</span>
          </button>
        </div>

        ${formData.isCustomDuration || (formData.durationDays !== 7 && formData.durationDays !== 30) ? `
          <div class="pt-2">
            <label for="custom_days_input" class="text-xs font-bold text-on-surface ml-1">Număr zile de tratament:</label>
            <input id="custom_days_input" type="number" min="1" max="3650" value="${formData.durationDays || 14}" class="w-full h-12 px-4 bg-background border border-outline-variant rounded-xl text-sm font-semibold focus:border-primary outline-none mt-1" placeholder="Ex: 14, 60, 90..." />
          </div>
        ` : ''}
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
        const inputCat = container.querySelector('#treatment_category');
        if (inputCat) formData.treatmentCategory = inputCat.value.trim();

        // Check medication items
        if (!formData.medications || formData.medications.length === 0) {
          alert('Vă rugăm să adăugați cel puțin un medicament în tratament.');
          return;
        }

        // Validate medication names
        let valid = true;
        formData.medications.forEach((m, i) => {
          if (!m.name || !m.name.trim()) {
            m.name = `Medicament ${i + 1}`;
          }
        });

        formData.name = formData.treatmentCategory || formData.medications[0].name;

        // Sync global isUnlimited flag if all meds are unlimited
        formData.isUnlimited = formData.medications.every(m => m.isUnlimited);

        currentStep = 2;
        renderWizardStep(container, navigateTo);
      } else if (currentStep === 2) {
        currentStep = 3;
        renderWizardStep(container, navigateTo);
      } else if (currentStep === 3) {
        const firstMed = formData.medications[0] || {};
        
        let formLabel = 'Comprimat';
        let icon = 'medication';
        let colorBg = 'bg-primary-fixed';
        let colorText = 'text-primary';

        if (firstMed.form === 'capsule') {
          formLabel = 'Capsulă';
          icon = 'pill';
          colorBg = 'bg-secondary-container';
          colorText = 'text-on-secondary-container';
        } else if (firstMed.form === 'liquid') {
          formLabel = 'Lichid / Sirop';
          icon = 'vaccines';
          colorBg = 'bg-tertiary-fixed';
          colorText = 'text-tertiary';
        } else if (firstMed.form === 'injection') {
          formLabel = 'Injecție';
          icon = 'syringe';
          colorBg = 'bg-error-container';
          colorText = 'text-error';
        }

        const isUnlim = formData.medications.every(m => m.isUnlimited);

        // Build dosage summary string
        const dosageSummary = formData.medications.map(m => {
          const unitLabel = m.dosageUnit === 'unitati' ? 'doze' : m.dosageUnit;
          return `${m.name} (${m.dosageValue || 1} ${unitLabel})`;
        }).join(' + ');

        const medToSave = {
          name: formData.name || formData.treatmentCategory || 'Tratament',
          treatmentCategory: formData.treatmentCategory || 'General',
          medications: formData.medications,
          form: firstMed.form || 'capsule',
          formLabel,
          dosageValue: firstMed.dosageValue || '1',
          dosageUnit: firstMed.dosageUnit || 'unitati',
          dosageDisplay: dosageSummary,
          durationDays: formData.durationDays,
          dosesPerDay: formData.dosesPerDay,
          times: formData.times,
          criticalAlert: formData.criticalAlert,
          soundChoice: formData.soundChoice,
          isUnlimited: isUnlim,
          totalStock: isUnlim ? 'unlimited' : (formData.medications[0].totalStock || 20),
          remainingStock: isUnlim ? 'unlimited' : (formData.medications[0].remainingStock !== undefined ? formData.medications[0].remainingStock : 20),
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

  // Step 1 Listeners
  if (currentStep === 1) {
    const inputCat = container.querySelector('#treatment_category');
    if (inputCat) {
      inputCat.addEventListener('input', (e) => {
        formData.treatmentCategory = e.target.value;
      });
    }

    container.querySelectorAll('.input-med-field').forEach(input => {
      input.addEventListener('input', (e) => {
        const idx = Number(e.target.getAttribute('data-med-index'));
        const field = e.target.getAttribute('data-med-field');
        if (formData.medications[idx]) {
          if (field === 'totalStock') {
            const val = parseInt(e.target.value, 10);
            formData.medications[idx].totalStock = isNaN(val) ? 20 : val;
            formData.medications[idx].remainingStock = isNaN(val) ? 20 : val;
          } else {
            formData.medications[idx][field] = e.target.value;
          }
        }
      });
    });

    container.querySelectorAll('.select-med-field').forEach(select => {
      select.addEventListener('change', (e) => {
        const idx = Number(e.target.getAttribute('data-med-index'));
        const field = e.target.getAttribute('data-med-field');
        if (formData.medications[idx]) {
          formData.medications[idx][field] = e.target.value;
        }
      });
    });

    container.querySelectorAll('.radio-med-form').forEach(radio => {
      radio.addEventListener('change', (e) => {
        const idx = Number(e.target.getAttribute('data-med-index'));
        if (formData.medications[idx]) {
          formData.medications[idx].form = e.target.value;
        }
      });
    });

    container.querySelectorAll('.chk-med-unlimited').forEach(chk => {
      chk.addEventListener('change', (e) => {
        const idx = Number(e.target.getAttribute('data-med-index'));
        if (formData.medications[idx]) {
          formData.medications[idx].isUnlimited = e.target.checked;
          if (e.target.checked) {
            formData.medications[idx].totalStock = 'unlimited';
            formData.medications[idx].remainingStock = 'unlimited';
          } else {
            formData.medications[idx].totalStock = 20;
            formData.medications[idx].remainingStock = 20;
          }
          renderWizardStep(container, navigateTo);
        }
      });
    });

    const btnAddAnother = container.querySelector('#btn-add-another-med');
    if (btnAddAnother) {
      btnAddAnother.addEventListener('click', () => {
        formData.medications.push({
          id: `med_${Date.now()}`,
          name: '',
          form: 'capsule',
          dosageValue: '1',
          dosageUnit: 'unitati',
          isUnlimited: false,
          totalStock: 20,
          remainingStock: 20
        });
        renderWizardStep(container, navigateTo);
      });
    }

    container.querySelectorAll('.btn-remove-med').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.getAttribute('data-remove-index'));
        if (formData.medications.length > 1) {
          formData.medications.splice(idx, 1);
          renderWizardStep(container, navigateTo);
        }
      });
    });
  }

  // Step 2 Listeners
  if (currentStep === 2) {
    container.querySelectorAll('.btn-duration').forEach(btn => {
      btn.addEventListener('click', () => {
        const val = btn.getAttribute('data-duration');
        if (val === 'custom') {
          formData.isCustomDuration = true;
          if (formData.durationDays === 7 || formData.durationDays === 30) {
            formData.durationDays = 14;
          }
        } else {
          formData.isCustomDuration = false;
          formData.durationDays = Number(val);
        }
        renderWizardStep(container, navigateTo);
      });
    });

    const inputCustomDays = container.querySelector('#custom_days_input');
    if (inputCustomDays) {
      inputCustomDays.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        formData.durationDays = isNaN(val) || val < 1 ? 1 : val;
      });
    }

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
  }

  // Step 3 Listeners
  if (currentStep === 3) {
    container.querySelectorAll('.btn-preview-sound').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const sId = btn.getAttribute('data-sound');
        playNotificationSound(sId, 75);
      });
    });

    container.querySelectorAll('input[name="sound_choice"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        formData.soundChoice = e.target.value;
      });
    });

    const chkCrit = container.querySelector('#chk-critical');
    if (chkCrit) {
      chkCrit.addEventListener('change', (e) => {
        formData.criticalAlert = e.target.checked;
      });
    }
  }
}
