/**
 * Client entry point
 *
 * Variables replaced at bundle time:
 *   APP_VERSION
 *   PAGE_MODULES
 *
 * Jam-build, a web application practical reference.
 * Copyright (c) 2025 Alex Grant <info@localnerve.com> (https://www.localnerve.com), LocalNerve LLC
 * 
 * This file is part of Jam-build.
 * Jam-build is free software: you can redistribute it and/or modify it
 * under the terms of the GNU Affero General Public License as published by the Free Software
 * Foundation, either version 3 of the License, or (at your option) any later version.
 * Jam-build is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY;
 * without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 * See the GNU Affero General Public License for more details.
 * You should have received a copy of the GNU Affero General Public License along with Jam-build.
 * If not, see <https://www.gnu.org/licenses/>.
 * Additional terms under GNU AGPL version 3 section 7:
 * a) The reasonable legal notice of original copyright and author attribution must be preserved
 *    by including the string: "Copyright (c) 2025 Alex Grant <info@localnerve.com> (https://www.localnerve.com), LocalNerve LLC"
 *    in this material, copies, or source code of derived works.
 */
import debugLib from '@localnerve/debug';
import createSupport from './support.js';
import setupHeader from './header.js';
import setupPrompts from './prompts.js';
import setupLogin from './login.js';
import setupData from './data.js';
import setupHeartbeat from './heartbeat.js';

const debug = debugLib('main');

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
async function updateVersion (support) {
  if (support.serviceWorker) {
    const versionEl = document.querySelector('.version-buildtime');

    const reg = await navigator.serviceWorker.ready;

    return new Promise(resolve => {
      navigator.serviceWorker.addEventListener('message', event => {
        const { action, version } = event.data;
        if (action === 'ln-version-buildstamp') {
          versionEl.innerText = version;
          resolve();
        }
      }, { once: true });

      reg.active.postMessage({ action: 'version' });
    });
  }
}

/**
 * Run the code for the current page.
 *
 * @param {Object} support - The browser support profile
 */
async function setupPage (support) {
  const { content: page } = document.querySelector('meta[name="page"]');

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
 * App setup main execution on DOMContentLoaded
 */
async function setup () {
  debug('running setup');

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
  setupHeartbeat(support);
  updateCurrentYear();

  return Promise.all([
    setupData(support),
    setupLogin(support),
    setupPage(support),
    updateVersion(support)
  ]);
}

/**
 * Main app entry.
 */
function start () {
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', setup, { once: true });
  }
  else {
    setup();
  }
}

window.App.version = APP_VERSION; // eslint-disable-line
window.App.pageModules = PAGE_MODULES; // eslint-disable-line

// Add entry point to app exec mediator
window.App.add('start', start);
