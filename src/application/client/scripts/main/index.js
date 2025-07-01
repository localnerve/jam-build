/**
 * Client entry point
 *
 * Variables replaced at bundle time:
 *   APP_VERSION
 *   PAGE_MODULES
 *
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */

import createSupport from './support.js';
import setupHeader from './header.js';
import setupPrompts from './prompts.js';
import setupLogin from './login.js';
import setupHeartbeat from './heartbeat.js';

/**
 * Update all current year elements in the page with the current full year.
 */
function updateCurrentYear () {
  const currentYear = (new Date()).getFullYear();
  Array.from(document.querySelectorAll('.current-year')).forEach(el => {
    const currentYearElement = el;
    currentYearElement.innerText = currentYear;
  });
}

/**
 * Get the version-buildstamp from the active app(sw), display on UI.
 *
 * @param {Object} support - The browser support profile
 * @returns {Promise} resolves on success (or no sw), reject on failure
 */
function updateVersion (support) {
  if (support.serviceWorker) {
    const versionEl = document.querySelector('.version-buildtime');
    return navigator.serviceWorker.ready.then(reg => {
      return new Promise(resolve => {
        navigator.serviceWorker.addEventListener('message', event => {
          const { action, version } = event.data;
          if (action === 'ln-version-buildstamp') {
            versionEl.innerText = version;
            resolve();
          }
        }, {
          once: true
        });
        reg.active.postMessage({ action: 'version' });
      });
    });
  }
  return Promise.resolve();
}

/**
 * Run the code for the current page.
 *
 * @param {Object} support - The browser support profile
 */
async function setupPage (support) {
  const { content:page } = document.querySelector('meta[name="page"]');
  if (window.App.pageModules.includes(page)) {
    const module = await import(`./pages/${page}.js`);
    const { default: setup } = module;
    return setup(support);
  }
}

/**
 * Called when browser load event fires.
 *
 * @param {Object} support - The browser support profile
 */
function loaded (support) {
  setupHeader(support);
}

/**
 * App setup main execution on DOMContentReady
 */
async function setup () {
  const support = await createSupport();

  support.init();

  if (document.readyState === 'complete') {
    loaded(support);
  } else {
    window.addEventListener('load', loaded.bind(null, support), {
      once: true
    });
  }

  setupPrompts(support);
  setupLogin(support);
  setupHeartbeat(support);
  updateCurrentYear();

  return Promise.all([
    updateVersion(support),
    setupPage(support)
  ]);
}

/**
 * Main app entry.
 */
function start () {
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', setup, {
      once: true
    });
  }
  else {
    setup();
  }
}

window.App.version = APP_VERSION; // eslint-disable-line
window.App.pageModules = PAGE_MODULES; // eslint-disable-line

// Add entry point to app exec mediator
window.App.add('start', start);
