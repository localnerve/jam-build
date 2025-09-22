/**
 * Utility functions for page tests.
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
import { makeStoreType } from '#client-utils/storeType.js';
import { expect } from './fixtures.js';

/**
 * Browser init script to pre-hook 'database-data-update' and record the last keys sent by storeType.
 * This prevents missing super fast messages before we get a chance to setup a message handler.
 */
export function initScriptDataUpdate ([authorizerURL, clientID]) {
  // console.log('window', window);
  // console.log('window.navigator', window.navigator);

  if (!window.__databaseDataUpdate) {
    window.__databaseDataUpdate = Object.create(null);
  }
  navigator.serviceWorker?.addEventListener('message', event => {
    const msgId = event?.data?.meta;
    const payload = event?.data?.payload;
    if (msgId === 'database-data-update') {
      window.__databaseDataUpdate[payload.storeType] = payload.keys;
    }
  });

  if (!window.__authorizerOverrides) {
    window.__authorizerOverrides = {
      authorizerURL,
      clientID
    }
  }
}

/**
 * Wait for the database-data-update message.
 * 
 * @param {Page} page - The playwright Page fixture
 * @param {Object} [options] - options object
 * @param {String} [options.storeType] - The storeType to wait for 'app' or 'user', defaults to 'app:public'
 * @param {Number} [options.timeout] - timeout, defaults to 3000
 * @param {Boolean} [options.readKeysFallback] - true to read local keys on timeout
 * @returns {Promise<Object>} A promise that resolves to the message payload object
 */
export function waitForDataUpdate (page, {
  storeType = makeStoreType('app', 'public'),
  timeout = 3000,
  readKeysFallback = false
} = {}) {
  return page.evaluate(([storeType, timeout, readKeysFallback]) => {
    let resolve;
    const waiter = new Promise(res => resolve = res);
    
    const keys = window.__databaseDataUpdate[storeType];
    if (keys) {
      // console.log('@@@ CAUGHT EARLY INVOCATION');
      setTimeout(() => resolve({ storeType, keys }), 0);
    } else {
      navigator.serviceWorker.addEventListener('message', event => {
        const msgId = event?.data?.meta;
        const payload = event?.data?.payload;
        if (msgId === 'database-data-update') {
          if (payload.storeType === storeType) {
            resolve(payload);
          }
        }
      });

      setTimeout(async () => {
        if (readKeysFallback) {
          // messy
          const dbname = 'jam_build';
          const storeTypeParts = storeType.split(':');
          const store = storeTypeParts[0];
          const scope = storeTypeParts[1];
          const storeName = `${store}_documents_1`;

          const request = indexedDB.open(dbname);
          request.onsuccess = event => {
            const db = event.target.result;
            const scopeIndex = db.transaction(storeName).objectStore(storeName).index('scope');
            const cursor = scopeIndex.openCursor(IDBKeyRange.only(scope));
            const keys = [];

            cursor.onsuccess = event => {
              const cursor = event.target.result;
              if (cursor) {
                keys.push([cursor.value.document_name, cursor.value.collection_name]);
                cursor.continue();
              } else {
                resolve({ storeType, keys });
              }
            };
            cursor.onerror = () => {
              resolve({ storeType: 'cursorError' });
            };
          };
          request.onerror = () => {
            resolve({ storeType: 'dbError' });
          };
        } else {
          resolve({ storeType: 'timeout' });
        }
      }, timeout);
    }

    return waiter;
  }, [storeType, timeout, readKeysFallback]);
}

/**
 * Start the navigation to an application page for some other purpose.
 * 
 * @param {String} url - The url to navigate to
 * @param {Page} page - The playwright.dev Page object
 * @returns {String} The application public storeType successfully waited for
 */
export async function startPage (url, page) {
  await page.addInitScript(
    initScriptDataUpdate, [process.env.AUTHZ_URL, process.env.AUTHZ_CLIENT_ID]
  );

  await page.goto(url);

  // For headed debugging
  await page.addScriptTag({
    content: 'localStorage.setItem("debug", "*");'
  });

  const storeType = makeStoreType('app', 'public');

  // Wait for the app to setup
  let payload = await waitForDataUpdate(page, {
    storeType,
    timeout: 8000
  });

  expect(payload.storeType).toEqual(storeType); // App loaded properly

  return storeType;
}