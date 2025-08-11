/**
 * Main serviceWorker custom additions.
 * 
 * Build time replacements:
 *   SSR_CACHEABLE_ROUTES - derived from site-data.json
 *   CACHE_PREFIX - derived from app host and version
 *   VERSION_BUILDSTAMP - derived from version buildstamp at build time.
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
import { cacheNames, setCacheNameDetails } from 'workbox-core';
import {
  installDatabase,
  activateDatabase,
  refreshData,
  batchUpdate,
  mayUpdate,
  logout,
  setupBackgroundRequests,
  __forceReplay
} from './sw.data.js';
import { debug, sendMessage } from './sw.utils.js';

setCacheNameDetails({
  prefix: CACHE_PREFIX // eslint-disable-line
});

function updateRuntimeCache () {
  const urls = SSR_CACHEABLE_ROUTES; // eslint-disable-line
  const cacheName = cacheNames.runtime;
  return caches.open(cacheName)
    .then(cache => cache.addAll(urls));
}

function sendResponse (event, response) {
  debug('Sending response: ', event, response);

  let result;
  const respondTo = (event.ports?.length > 0 && event.ports[0]) || event.source;

  if (respondTo) {
    respondTo.postMessage(response);
  } else {
    sendMessage(null, response);
  }

  return result || Promise.resolve();
}

self.addEventListener('install', event => {
  event.waitUntil(Promise.all([
    updateRuntimeCache(),
    installDatabase()
  ]));
});

self.addEventListener('activate', event => {
  const versionedCachePrefix = CACHE_PREFIX; // eslint-disable-line
  event.waitUntil(Promise.all([
    caches.keys().then(keys => Promise.all(
      keys.map(key => {
        if (!key.startsWith(versionedCachePrefix)) {
          return caches.delete(key);
        }
        return Promise.resolve();
      })
    )),
    activateDatabase()
  ]));
});

self.addEventListener('message', event => {
  const { action, payload = {} } = event.data;
  const backgroundSyncSupportTest = 'ln-background-sync-support-test';
  const waitOrPassThru = 'waitUntil' in event ? event.waitUntil.bind(event): val => val;
  const sendReply = sendResponse.bind(null, event);

  debug('Message event handler called:', event);

  switch (action) {
    case backgroundSyncSupportTest:
      debug('backgroundSyncSupportTest message');
      if ('sync' in self.registration) {
        waitOrPassThru(self.registration.sync.register(backgroundSyncSupportTest)
          .then(() => {
            setupBackgroundRequests(true);
            return sendReply({ action: backgroundSyncSupportTest, result: true });
          }, () => {
            setupBackgroundRequests(false);
            return sendReply({ action: backgroundSyncSupportTest, result: false });
          }));
      } else {
        setupBackgroundRequests(false);
        waitOrPassThru(sendReply({
          action: backgroundSyncSupportTest, result: false
        }));
      }
      break;

    case 'version':
      debug('version message');
      waitOrPassThru(sendReply({
        action: 'ln-version-buildstamp',
        version: VERSION_BUILDSTAMP // eslint-disable-line
      }));
      break;

    case 'runtime-update':
      debug('runtime-update message');
      waitOrPassThru(
        updateRuntimeCache().then(() => {
          return sendReply({ result: true });
        }, () => {
          return sendReply({ result: false });
        })
      );
      break;

    case 'refresh-data':
      debug('refresh-data message');
      waitOrPassThru(
        refreshData(payload)
      );
      break;

    case 'batch-update':
      debug('batch-update message');
      waitOrPassThru(
        batchUpdate(payload)
      );
      break;

    case 'may-update':
      debug('may-update message');
      waitOrPassThru(
        mayUpdate(payload)
      );
      break;

    case 'logout':
      debug('logout message');
      waitOrPassThru(
        logout(payload)
      );
      break;
  
    case '__coverage__':
      debug('__coverage__ message');
      waitOrPassThru(
        sendReply({
          action: '__coverage__',
          result: self.__coverage__
        })
      );
      break;

    case '__forceReplay__':
      debug('__forceReplay__ message');
      waitOrPassThru(
        __forceReplay()
      );
      break;

    default:
      break;
  }
});