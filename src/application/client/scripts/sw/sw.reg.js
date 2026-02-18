/**
 * Service Worker Registration.
 * 
 * Handles service worker registration and custom install and update prompt triggers.
 * 
 * This is the only js module not cached.
 * Update here to perform any normative interruptive change - Runs before the main app.
 * 
 * This is run in the main window context, loaded and executed after polyfills (if required), but before the main app.
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

import { Workbox } from 'workbox-window';

function handleAfterInstall (event) {
  window.App.exec('pageReloadOnUpdate', {
    args: {
      isUpdate: event.isUpdate,
      duration: 1500
    }
  });
}

function handleWaiting (wb) {
  window.App.exec('pageInstallPrompt', {
    args: {
      startInstall: () => {
        wb.messageSkipWaiting();
      }
    }
  });
}

function registerSW () {
  if ('serviceWorker' in navigator) {
    const wb = new Workbox('/sw.main.js');
    wb.addEventListener('waiting', handleWaiting.bind(null, wb));
    wb.addEventListener('controlling', handleAfterInstall);
    wb.register();
  }
}

window.addEventListener('pageshow', (event) => {
  // If event.persisted is true, the page was restored from bfcache
  // and we should skip the redundant registration.
  // Service worker registration is idempotent, but BF cache is a special case.
  if (!event.persisted) {
    registerSW();
  }
});
