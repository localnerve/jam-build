/**
 * storeType utility methods and constants.
 * 
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
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