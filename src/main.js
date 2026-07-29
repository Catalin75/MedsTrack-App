import { initSeedData } from './db.js';
import { renderDashboard } from './views/dashboard.js';
import { renderAddMedication } from './views/addMedication.js';
import { renderCabinet } from './views/cabinet.js';
import { renderNotifications } from './views/notifications.js';
import { renderHistory } from './views/history.js';

let currentView = 'dashboard';

async function initApp() {
  await initSeedData();

  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('./service-worker.js');
    } catch (e) {
      console.log('ServiceWorker note:', e.message);
    }
  }

  setupNavigation();
  navigateTo('dashboard');
}

function setupNavigation() {
  const navButtons = document.querySelectorAll('#bottom-nav [data-nav]');
  navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetView = btn.getAttribute('data-nav');
      navigateTo(targetView);
    });
  });
}

export function navigateTo(viewName, params = {}) {
  currentView = viewName;
  const appContainer = document.getElementById('app');
  const bottomNav = document.getElementById('bottom-nav');

  if (!appContainer) return;

  // Update Nav Active State
  const navButtons = document.querySelectorAll('#bottom-nav [data-nav]');
  navButtons.forEach(btn => {
    const navKey = btn.getAttribute('data-nav');
    if (navKey === viewName) {
      btn.className = 'nav-item flex flex-col items-center justify-center bg-primary-container text-on-primary-container rounded-xl px-4 py-1 active:scale-90 transition-all font-bold';
      btn.querySelector('.material-symbols-outlined').style.fontVariationSettings = "'FILL' 1";
    } else {
      btn.className = 'nav-item flex flex-col items-center justify-center text-on-surface-variant p-2 rounded-xl transition-all active:scale-90 font-medium hover:bg-surface-container-high';
      btn.querySelector('.material-symbols-outlined').style.fontVariationSettings = "'FILL' 0";
    }
  });

  // Hide Bottom Nav on Wizard screens
  if (viewName === 'addMedication' || viewName === 'editMedication') {
    bottomNav.classList.add('hidden');
  } else {
    bottomNav.classList.remove('hidden');
  }

  window.scrollTo({ top: 0, behavior: 'instant' });

  if (viewName === 'dashboard') {
    renderDashboard(appContainer, navigateTo);
  } else if (viewName === 'addMedication' || viewName === 'editMedication') {
    renderAddMedication(appContainer, navigateTo, params.editId);
  } else if (viewName === 'cabinet') {
    renderCabinet(appContainer, navigateTo);
  } else if (viewName === 'notifications') {
    renderNotifications(appContainer, navigateTo);
  } else if (viewName === 'history') {
    renderHistory(appContainer, navigateTo);
  }
}

// Start app
window.addEventListener('DOMContentLoaded', initApp);
