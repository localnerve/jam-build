/**
 * Request handling for pages
 * 
 * Jam-build, a web application practical reference.
 * Copyright (c) 2025 Alex Grant <info@localnerve.com> (https://www.localnerve.com), LocalNerve LLC
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
 *    by including the string: "Copyright (c) 2025 Alex Grant <info@localnerve.com> (https://www.localnerve.com), LocalNerve LLC"
 *    in this material, copies, or source code of derived works.
 */
import debugLib from '@localnerve/debug';
import { makeStoreType } from '#client-utils/storeType.js';
import { filterSeed } from './seed.js';

const appPublic = makeStoreType('app', 'public');
const debug = debugLib('request');

/**
 * Launch a series of refresh-data requests from the page request seed.
 * Defaults to getting/refreshing the 'app:public' storeType for the page.
 * Eventually results in 'pageDataUpdate' getting called.
 *
 * @param {String} page - The page, document name
 * @param {Object} [filterObject] - Request seed filter @see data.js/filterSeed
 * @param {Array} [filterObject.storeTypes] - The storeTypes to update
 * @param {Array} [filterObject.collections] - The collections to update
 */
export async function updatePageData (page, filter = {
  storeTypes: [appPublic]
}) {
  const seed = JSON.parse(localStorage.getItem('seed'));
  const filteredSeed = filterSeed(page, seed, filter);

  // filteredSeed test is important here in the data cycle.
  // If nullish, it means we DONT want to make the request here: The data will arrive shortly via serviceWorker 'pageDataUpdate'
  if ('serviceWorker' in navigator && filteredSeed) {
    const reg = await navigator.serviceWorker.ready;
    for (const [, payload] of Object.entries(filteredSeed)) {
      debug(`${page} Sending 'refresh-data' to sw for '${payload.storeType}'`, payload);

      reg.active.postMessage({ 
        action: 'refresh-data',
        payload
      });
    }
  } else {
    debug(`${page} will not send refresh-data for ${filter.storeTypes}`);
  }
}
