/**
 * Utilities for handling the page request seed.
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
import { makeStoreType } from '#client-utils/storeType.js';

const appStoreType = makeStoreType('app', 'public');

/**
 * Create or update a page request seed object.
 * A page request seed object is a persistent momento that contains enough info to
 * make data requests and keep the local persistent copy consistent.
 *
 * It contains key, val pairs for app and user data requests by storeType:
 *   storeType => { storeType, document, collections ['name1', 'name2'...] }
 *   storeType => { storeType, document, collections ['name1', 'name2'...] }
 *   
 * @param {String} page - The page, document name
 * @param {Object} seed - The previous request seed object
 * @param {Object} next - The incoming payload object, presumably from refreshData update callback
 * @returns {Object} The updated seed object
 */
export function pageSeed (page, seed = {}, next = null) {
  if (!next) {
    return seed;
  }

  const newCollections = next.keys.reduce((acc, [doc, col]) => {
    if (doc === page) {
      acc.push(col);
    }
    return acc;
  }, []);

  seed[`${next.storeType}`] = {
    storeType: next.storeType,
    document: page,
    collections: newCollections
  };

  return seed;
}

/**
 * Filter a request seed by page, storeType, and collections.
 *
 * @param {String} page - The page, document name
 * @param {Object} seed - The request seed to filter
 * @param {Object} filterOptions - How to reduce to the seed
 * @param {Array} filterOptions.storeTypes - The storeType of interest
 * @param {Array} filterOptions.collections - The collections of interest
 * @returns {Object} The filtered request seed
 */
export function filterSeed (page, seed, {
  storeTypes = [appStoreType],
  collections = []
} = {}) {
  if (!seed) {
    return seed;
  }

  const inputColl = new Set(collections);

  return Object.entries(seed).reduce((acc, [key, payload]) => {
    const payloadColl = new Set(payload.collections);
    const storeType = key;

    if (storeTypes.includes(storeType)) {
      const filteredColl = [...payloadColl.intersection(inputColl)];

      acc[storeType] = {
        storeType,
        document: page,
        collections: !filteredColl.length ? undefined : filteredColl
      };
    }

    return acc;
  }, {});
}