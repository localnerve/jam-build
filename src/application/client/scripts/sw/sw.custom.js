import { cacheNames, setCacheNameDetails } from 'workbox-core';

setCacheNameDetails({ prefix: CACHE_PREFIX });

function updateRuntimeCache () {
  const urls = SSR_CACHEABLE_ROUTES;
  const cacheName = cacheNames.runtime;
  return caches.open(cacheName)
    .then(cache => cache.addAll(urls))
}

function sendResponse (event, response) {
  let result;
  const respondTo = event.source || (event.ports && event.ports[0]);

  if (respondTo) {
    respondTo.postMessage(response);
  } else {
    if (self.clients) {
      result = clients.matchAll().then(clients => {
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
  const versionedCachePrefix = CACHE_PREFIX;
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
        version: VERSION_BUILDSTAMP
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