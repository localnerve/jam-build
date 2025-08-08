/**
 * Application page user methods.
 * 
 * Jam-build, a web application practical reference.
 * Copyright (c) 2025 Alex Grant <info@localnerve.com>, LocalNerve LLC
 * 
 * This file is part of Jam-build.
 * Jam-build is free software: you can redistribute it and/or modify it
 * under the terms of the GNU Affero General Public License as published by the Free Software
 * Foundation, either version 3 of the License, or (at your option) any later version.
 * Jam-build is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY;
 * without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 * See the GNU Affero General Public License for more details.
 * You should have received a copy of the GNU Affero General Public License along with Jam-build.
 * If not, see <https://www.gnu.org/licenses/>
 */
import { pageSeed } from './seed.js';
import { updatePageData } from './request.js';
import { createStore } from './stores.js';

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
