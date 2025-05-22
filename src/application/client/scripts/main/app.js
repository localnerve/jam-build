/**
 * Application page app methods.
 * 
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */
import { updatePageData } from './request.js';
import { createStore } from './data.js';

/**
 * Get the app store.
 * 
 * @param {String} page - The name of the page
 * @return {Object} The hot proxied app data store
 */
export async function getApplicationStore (page) {
  await updatePageData(page);

  return createStore('app', page);
}