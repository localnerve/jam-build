/**
 * storeType utility methods and constants.
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

const storeTypeDelim = ':';

/**
 * Make storeType from store and scope
 */
export function makeStoreType (store, scope) {
  return `${store}${storeTypeDelim}${scope}`;
}

/**
 * Get the data scope from the storeType.
 * 
 * @param {String} storeType - store:scope
 * @returns {String} The data scope string value
 */
export function getStoreTypeScope (storeType) {
  return storeType.split(storeTypeDelim)[1];
}

/**
 * Get the data store from the storeType.
 * 
 * @param {String} storeType - store:scope
 * @returns {String} The data store string value
 */
export function getStoreTypeStore (storeType) {
  return storeType.split(storeTypeDelim)[0];
}

/**
 * Convert storeType to an array of tokens.
 * Strip any hex userId from storeType if it is there.
 * 
 * @param {String} storeType - The storeType path to a document
 * @returns {Array} an Array of the storeType tokens
 */
export function storeTypeToArrayWithoutUserId (storeType) {
  return storeType.split(storeTypeDelim).filter(t => !/^[0-9a-fA-F]+$/.test(t));
}