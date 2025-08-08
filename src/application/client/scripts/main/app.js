/**
 * Application page app methods.
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
 * If not, see <https://www.gnu.org/licenses/>.
 * Additional terms under GNU AGPL version 3 section 7:
 * a) The reasonable legal notice of original copyright and author attribution must be preserved
 *    by including the string: "Copyright (c) 2025 Alex Grant <info@localnerve.com>, LocalNerve LLC"
 *    in this material, copies, or source code of derived works.
 */
import { makeStoreType } from '#client-utils/storeType.js';
import { updatePageData } from './request.js';
import { createStore } from './stores.js';

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