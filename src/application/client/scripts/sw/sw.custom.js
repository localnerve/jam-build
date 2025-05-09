/**
 * Main serviceWorker custom additions.
 * 
 * Build time replacements:
 *   SSR_CACHEABLE_ROUTES - derived from site-data.json
 *   CACHE_PREFIX - derived from app host and version
 *   VERSION_BUILDSTAMP - derived from version buildstamp at build time.
 *
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */
import { cacheNames, setCacheNameDetails } from 'workbox-core';
import {
  installDatabase,
  activateDatabase,
  refreshData,
  upsertData,
  deleteData
} from './sw.data.js';

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

  switch (action) {
    case backgroundSyncSupportTest:
      if ('sync' in self.registration) {
        waitOrPassThru(self.registration.sync.register(backgroundSyncSupportTest)
          .then(() => {
            sendReply({ action: backgroundSyncSupportTest, result: true });
          }, () => {
            sendReply({ action: backgroundSyncSupportTest, result: false });
          }));
      } else {
        waitOrPassThru(sendReply({
          action: backgroundSyncSupportTest, result: false
        }));
      }
      break;
    case 'version':
      waitOrPassThru(sendReply({
        action: 'ln-version-buildstamp',
        version: VERSION_BUILDSTAMP // eslint-disable-line
      }));
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
    case 'refresh-data':
      waitOrPassThru(
        refreshData(payload.storeType, payload.document, payload.collections)
      );
      break;
    case 'put-data':
      waitOrPassThru(
        upsertData(payload.storeType, payload.document, payload.collections)
      );
      break;
    case 'delete-data':
      waitOrPassThru(
        deleteData(payload.storeType, payload.document, payload.collections)
      );
      break;
    default:
      break;
  }
});