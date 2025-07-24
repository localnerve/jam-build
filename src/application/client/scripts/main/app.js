/**
 * Application page app methods.
 * 
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */
import { updatePageData } from './request.js';
import { createStore } from './data.js';
import { makeStoreType } from './utils.js';

/**
 * Get the public application store.
 * 
 * @param {String} page - The name of the page
 * @return {Object} The hot proxied app data store
 */
export async function getPublicApplicationStore (page) {
  await updatePageData(page);

  return createStore(makeStoreType('app', 'public'), page);
}