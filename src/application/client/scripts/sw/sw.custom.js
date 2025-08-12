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
 *   by including the string: "Copyright (c) 2025 Alex Grant <info@localnerve.com> (https://www.localnerve.com), LocalNerve LLC"
 *   in this material, copies, or source code of derived works.
 */
import { cacheNames, setCacheNameDetails } from 'workbox-core';

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
  let result;
  const respondTo = event.source || (event.ports && event.ports[0]);

  if (respondTo) {
    respondTo.postMessage(response);
  } else {
    if (self.clients) {
      result = self.clients.matchAll().then(clients => {
        for (let i = 0; i < clients.length; i++) {
          clients[i].postMessage(response);
        }
      });
    }
  }

  return result || Promise.resolve();
}

self.addEventListener('install', event => {
  event.waitUntil(updateRuntimeCache());
});

self.addEventListener('activate', event => {
  const versionedCachePrefix = CACHE_PREFIX; // eslint-disable-line
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.map(key => {
        if (!key.startsWith(versionedCachePrefix)) {
          return caches.delete(key);
        }
        return Promise.resolve();
      })
    ))
  );
});

self.addEventListener('message', event => {
  const { action } = event.data;
  const backgroundSyncSupportTest = 'ln-background-sync-support-test';
  const waitOrPassThru = 'waitUntil' in event ? event.waitUntil.bind(event): val => val;
  const sendReply = sendResponse.bind(null, event);

  switch (action) {
    case backgroundSyncSupportTest:
      if ('sync' in self.registration) {
        self.registration.sync.register(backgroundSyncSupportTest)
          .then(() => {
            sendReply({ action: backgroundSyncSupportTest, result: true });
          }, () => {
            sendReply({ action: backgroundSyncSupportTest, result: false });
          });
      } else {
        sendReply({ action: backgroundSyncSupportTest, result: false });
      }
      break;
    case 'version':
      sendReply({
        action: 'ln-version-buildstamp',
        version: VERSION_BUILDSTAMP // eslint-disable-line
      });
      break;
    case 'runtime-update':
      waitOrPassThru(
        updateRuntimeCache().then(() => {
          sendReply({ result: true });
        }, () => {
          sendReply({ result: false });
        })
      );
      break;
    default:
      break;
  }
});