/**
 * Application page app methods.
 * 
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */
import { makeStoreType } from '#client-utils/storeType.js';
import { updatePageData } from './request.js';
import { createStore } from './page-data.js';

const appPublic = makeStoreType('app', 'public');

/**
 * Get an application store.
 * 
 * @param {String} page - The name of the page
 * @param {String} storeType - The storeType of the dataset to get, defaults to app:public
 * @return {Object} The hot proxied app data store
 */
export async function getApplicationStore (page, storeType = appPublic) {
  await updatePageData(page);

  return createStore(storeType);
}