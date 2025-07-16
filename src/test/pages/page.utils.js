/**
 * Utility functions for page tests.
 * 
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */

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
 * @param {String} [options.storeType] - The storeType to wait for 'app' or 'user', defaults to 'app'
 * @param {Number} [options.timeout] - timeout, defaults to 3000
 * @returns {Promise<Object>} A promise that resolves to the message payload object
 */
export function waitForDataUpdate (page, {
  storeType = 'app',
  timeout = 3000
} = {}) {
  return page.evaluate(([storeType, timeout]) => {
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
      setTimeout(() => resolve({ storeType: 'timeout' }), timeout);
    }

    return waiter;
  }, [storeType, timeout]);
}
