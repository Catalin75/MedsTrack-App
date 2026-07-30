import { getSettings, saveSettings, getVoiceMemos } from '../db.js';
import { playNotificationSound } from '../audio.js';

export async function renderNotifications(container, navigateTo) {
  const settings = await getSettings();
  const voiceMemos = await getVoiceMemos();

  container.innerHTML = `
    <!-- Top App Bar -->
    <header class="sticky top-0 z-40 bg-background/95 backdrop-blur-md flex justify-between items-center px-container-margin py-stack-md border-b border-outline-variant/20">
      <div class="flex items-center gap-3">
        <button id="btn-nav-back" class="w-10 h-10 flex items-center justify-center rounded-full hover:bg-surface-container-low active:scale-95 transition-colors">
          <span class="material-symbols-outlined text-on-surface">arrow_back</span>
        </button>
        <h1 class="text-lg font-bold text-primary">Sunete și Alerte</h1>
      </div>
      <div class="w-10 h-10 flex items-center justify-center text-primary">
        <span class="material-symbols-outlined">notifications_active</span>
      </div>
    </header>

    <main class="px-container-margin max-w-md mx-auto w-full flex-1 mt-4 space-y-5 pb-32">
      <!-- Global Toggles Card -->
      <section class="bg-surface-container-lowest rounded-2xl p-4 shadow-sm border border-outline-variant/30 space-y-4">
        <!-- Vibration Toggle -->
        <div class="flex items-center justify-between">
          <div class="space-y-0.5">
            <p class="text-sm font-bold text-on-surface">Vibrații</p>
            <p class="text-xs text-on-surface-variant">Activează vibrațiile la notificare</p>
          </div>
          <label class="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" id="chk-vibration" ${settings.vibration ? 'checked' : ''} class="sr-only peer" />
            <div class="w-12 h-6 bg-surface-container-highest rounded-full peer-checked:bg-primary transition-all relative after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-6"></div>
          </label>
        </div>

        <hr class="border-outline-variant/20" />

        <!-- Critical Alerts Toggle -->
        <div class="flex items-center justify-between">
          <div class="space-y-0.5">
            <div class="flex items-center gap-1.5">
              <p class="text-sm font-bold text-on-surface">Alerte Critice</p>
              <span class="material-symbols-outlined text-error text-sm">priority_high</span>
            </div>
            <p class="text-xs text-on-surface-variant">Ignoră modul silențios pentru medicație vitală</p>
          </div>
          <label class="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" id="chk-critical-global" ${settings.criticalAlerts ? 'checked' : ''} class="sr-only peer" />
            <div class="w-12 h-6 bg-surface-container-highest rounded-full peer-checked:bg-error transition-all relative after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-6"></div>
          </label>
        </div>
      </section>

      <!-- Volume Slider Card -->
      <section class="bg-surface-container-lowest rounded-2xl p-4 shadow-sm border border-outline-variant/30 space-y-3">
        <div class="flex items-center justify-between">
          <h2 class="text-xs font-bold uppercase tracking-wider text-outline">Volum Alertă (${settings.volume}%)</h2>
          <span class="material-symbols-outlined text-primary" id="vol-icon">volume_up</span>
        </div>
        <div class="px-1">
          <input type="range" id="vol-range" min="0" max="100" value="${settings.volume}" class="w-full h-2 bg-surface-container-highest rounded-lg appearance-none cursor-pointer accent-primary" />
          <div class="flex justify-between mt-2 text-[11px] text-on-surface-variant font-medium">
            <span>Silențios</span>
            <span>Maxim</span>
          </div>
          <div class="mt-3 flex justify-center">
            <button id="btn-test-sound" class="flex items-center gap-2 bg-primary text-on-primary px-4 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 hover:bg-primary-container">
              <span class="material-symbols-outlined text-lg">play_circle</span>
              <span>Testează sunetul</span>
            </button>
          </div>
        </div>
      </section>

      <!-- Sound Selection List -->
      <section class="space-y-4">
        <div class="space-y-2">
          <h2 class="text-xs font-bold uppercase tracking-wider text-outline px-1">Sunet Notificare Implicit</h2>
          <div class="space-y-2">
            ${[
              { id: 'bell', title: 'Clopoțel (Default)', desc: 'Clar, blând și cristalin' },
              { id: 'vital', title: 'Puls Vital', desc: 'Bip ritmic și constant' },
              { id: 'alert', title: 'Alertă Medicală', desc: 'Ton urgent și persistent' },
              { id: 'zen', title: 'Zen Bowl', desc: 'Melodie calmantă și relaxantă' },
              { id: 'echo', title: 'Digital Echo', desc: 'Sunet sintetic modern' }
            ].map(s => `
              <label class="flex items-center justify-between bg-surface-container-lowest p-3.5 rounded-2xl border-2 ${settings.soundChoice === s.id ? 'border-primary bg-primary-fixed/10' : 'border-outline-variant/30'} cursor-pointer hover:border-primary/50 transition-all">
                <div class="flex items-center gap-3">
                  <button type="button" data-sound="${s.id}" class="btn-play-sound-item w-9 h-9 flex items-center justify-center bg-primary-fixed rounded-full text-primary hover:scale-105 active:scale-95 transition-all">
                    <span class="material-symbols-outlined text-xl">play_arrow</span>
                  </button>
                  <div>
                    <p class="text-sm font-bold text-on-surface">${s.title}</p>
                    <p class="text-xs text-on-surface-variant">${s.desc}</p>
                  </div>
                </div>
                <input type="radio" name="global_sound" value="${s.id}" ${settings.soundChoice === s.id ? 'checked' : ''} class="w-5 h-5 text-primary" />
              </label>
            `).join('')}
          </div>
        </div>

        <!-- Recorded Voice Memos Options Section -->
        <div class="space-y-2 pt-2">
          <div class="flex items-center justify-between px-1">
            <h2 class="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
              <span class="material-symbols-outlined text-sm text-tertiary">mic</span>
              <span>Mementouri Vocale Înregistrate (${voiceMemos.length})</span>
            </h2>
          </div>

          ${voiceMemos.length === 0 ? `
            <div class="p-3.5 bg-surface-container-lowest rounded-2xl border border-outline-variant/30 text-center space-y-1">
              <p class="text-xs font-bold text-on-surface">Nu aveți mementouri vocale înregistrate încă.</p>
              <p class="text-[11px] text-on-surface-variant">Puteți înregistra mesaje vocale la adăugarea sau editarea unui tratament.</p>
            </div>
          ` : `
            <div class="space-y-2">
              ${voiceMemos.map(vm => {
                const valKey = `voice_${vm.id}`;
                const isSelected = settings.soundChoice === valKey;
                const dateStr = vm.createdAt ? new Date(vm.createdAt).toLocaleDateString('ro-RO') : 'Înregistrat';
                return `
                  <label class="flex items-center justify-between bg-surface-container-lowest p-3.5 rounded-2xl border-2 ${isSelected ? 'border-primary bg-primary-fixed/10' : 'border-outline-variant/30'} cursor-pointer hover:border-primary/50 transition-all">
                    <div class="flex items-center gap-3">
                      <button type="button" data-sound="${valKey}" class="btn-play-sound-item w-9 h-9 flex items-center justify-center bg-tertiary-fixed rounded-full text-tertiary hover:scale-105 active:scale-95 transition-all">
                        <span class="material-symbols-outlined text-xl">play_arrow</span>
                      </button>
                      <div>
                        <p class="text-sm font-bold text-on-surface">🎙️ Memento Vocal #${vm.id}</p>
                        <p class="text-xs text-on-surface-variant">Durată: ${vm.durationSeconds || 5}s • ${dateStr}</p>
                      </div>
                    </div>
                    <input type="radio" name="global_sound" value="${valKey}" ${isSelected ? 'checked' : ''} class="w-5 h-5 text-primary" />
                  </label>
                `;
              }).join('')}
            </div>
          `}
        </div>
      </section>

    </main>
  `;

  // Attach Event Listeners
  const btnBack = container.querySelector('#btn-nav-back');
  if (btnBack) btnBack.addEventListener('click', () => navigateTo('dashboard'));

  const chkVib = container.querySelector('#chk-vibration');
  if (chkVib) {
    chkVib.addEventListener('change', async (e) => {
      settings.vibration = e.target.checked;
      await saveSettings(settings);
    });
  }

  const chkCrit = container.querySelector('#chk-critical-global');
  if (chkCrit) {
    chkCrit.addEventListener('change', async (e) => {
      settings.criticalAlerts = e.target.checked;
      await saveSettings(settings);
    });
  }

  const volRange = container.querySelector('#vol-range');
  const volIcon = container.querySelector('#vol-icon');
  if (volRange) {
    volRange.addEventListener('input', async (e) => {
      const val = parseInt(e.target.value, 10);
      settings.volume = val;
      await saveSettings(settings);

      if (volIcon) {
        if (val === 0) volIcon.innerText = 'volume_off';
        else if (val < 50) volIcon.innerText = 'volume_down';
        else volIcon.innerText = 'volume_up';
      }
    });
  }

  const btnTest = container.querySelector('#btn-test-sound');
  if (btnTest) {
    btnTest.addEventListener('click', () => {
      playNotificationSound(settings.soundChoice || 'bell', settings.volume || 75);
    });
  }

  container.querySelectorAll('.btn-play-sound-item').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const sId = btn.getAttribute('data-sound');
      playNotificationSound(sId, settings.volume || 75);
    });
  });

  container.querySelectorAll('input[name="global_sound"]').forEach(radio => {
    radio.addEventListener('change', async (e) => {
      settings.soundChoice = e.target.value;
      await saveSettings(settings);
      renderNotifications(container, navigateTo);
    });
  });
}
