/**
 * Request handling for pages
 * 
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */
import debugLib from '@localnerve/debug';
import { filterSeed } from './seed.js';

const debug = debugLib('request');

/**
 * Launch a series of refresh-data requests from the page request seed.
 * Defaults to getting/refreshing the 'app' storeType for the page.
 * Eventually results in 'pageDataUpdate' getting called.
 *
 * @param {String} page - The page, document name
 * @param {Object} [filterObject] - Request seed filter @see data.js/filterSeed
 * @param {Array} [filterObject.storeTypes] - The storeTypes to update
 * @param {Array} [filterObject.collections] - The collections to update
 */
export async function updatePageData (page, filter = {
  storeTypes: ['app']
}) {
  const seed = JSON.parse(localStorage.getItem('seed'));
  const filteredSeed = filterSeed(page, seed, filter);

  // filteredSeed test is important here in the data cycle.
  // If nullish, it means we DONT want to make the request here: The data will arrive shortly via serviceWorker 'pageDataUpdate'
  if ('serviceWorker' in navigator && filteredSeed) {
    const reg = await navigator.serviceWorker.ready;
    for (const [, payload] of Object.entries(filteredSeed)) {
      debug(`${page} Sending 'refresh-data' action to service worker`, payload);

      reg.active.postMessage({ 
        action: 'refresh-data',
        payload
      });
    }
  }
}
