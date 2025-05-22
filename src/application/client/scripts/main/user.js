/**
 * Application page user methods.
 * 
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */
import { pageSeed } from './seed.js';
import { updatePageData } from './request.js';
import { createStore } from './data.js';

/**
 * Get the user store.
 * 
 * @param {String} page - The name of the page
 * @returns {Object} The hot proxied user store
 */
export async function getUserStore (page) {
  const seed = JSON.parse(localStorage.getItem('seed')) || undefined;
  
  localStorage.setItem('seed', JSON.stringify(pageSeed(page, seed, {
    storeType: 'user',
    keys: []
  })));
  
  await updatePageData(page, {
    storeTypes: ['user']
  });

  return createStore('user', page);
}
