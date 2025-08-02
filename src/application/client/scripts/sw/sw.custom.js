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
import { cacheNames, setCacheNameDetails, _private } from 'workbox-core';
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
import { sendMessage } from './sw.utils.js';

const { debug } = _private.logger || { debug: ()=> {} };

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