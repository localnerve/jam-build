/**
 * Application page user methods.
 * 
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */
import { pageSeed } from './seed.js';
import { updatePageData } from './request.js';
import { createStore } from './page-data.js';

/**
 * Get the user store.
 * 
 * @param {String} page - The name of the page
 * @param {String} storeType - The user storeType
 * @returns {Object} The hot proxied user store
 */
export async function getUserStore (page, storeType) {
  const seed = JSON.parse(localStorage.getItem('seed')) || undefined;

  localStorage.setItem('seed', JSON.stringify(pageSeed(page, seed, {
    storeType,
    keys: []
  })));
  
  await updatePageData(page, {
    storeTypes: [storeType]
  });

  return createStore(storeType);
}
