/**
 * Utilities for handling the page request seed.
 * 
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */
import { makeStoreType } from '#client-utils/storeType.js';

const appStoreType = makeStoreType('app', 'public');

/**
 * Create or update a page request seed object.
 * A page request seed object is a persistent momento that contains enough info to
 * make data requests and keep the local persistent copy consistent.
 *
 * It contains key, val pairs for app and user data requests:
 *   'app:page-name' => { storeType, document, collections ['name1', 'name2'...] }
 *   'user:page-name' => { storeType, document, collections ['name1', 'name2'...] }
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

  seed[`${next.storeType}-${page}`] = {
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
    const [keyType, keyPage] = key.split('-');

    if (storeTypes.includes(keyType) && page === keyPage) {
      const filteredColl = [...payloadColl.intersection(inputColl)];

      acc[`${keyType}-${keyPage}`] = {
        storeType: keyType,
        document: keyPage,
        collections: !filteredColl.length ? undefined : filteredColl
      };
    }

    return acc;
  }, {});
}