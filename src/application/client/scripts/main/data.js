/**
 * Main thread data access.
 * 
 * A persistent nanostore proxy on indexeddb with batched backend mutations.
 * 
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */
import { openDB } from 'idb';
import { setPersistentEngine, persistentMap } from '@nanostores/persistent';
import debugLib from '@localnerve/debug';

const debug = debugLib('data');

const storeNames = new Map();
const createdMaps = new Set();

const storageMemory = {};

let db;
let listeners = [];
let disableMutation = false;

/**
 * Creates the data map for the given page.
 * Sets up data update handling.
 * Should only be called once per page load.
 *
 * @param {String} storeType - 'app' or 'user'
 * @param {String} page - The page, document of the map to get
 * @returns {persistentMap} - The persistent map
 */
export function createMap (storeType, page) {
  if (!createdMaps.has(`${storeType}:${page}`)) {
    debug(`Creating map for ${storeType}:${page}...`);

    const map = new persistentMap(`${storeType}:${page}:`, {}, { listen: true });
    createdMaps.add(`${storeType}:${page}`);

    // Install the handler for pageDataUpdate network callbacks from the service worker
    // window.App doesn't allow duplicates
    window.App.add('pageDataUpdate', async payload => {
      debug(`Page ${page} received pageDataUpdate from service worker`, payload);

      const seed = JSON.parse(localStorage.getItem(page)) || undefined;
      localStorage.setItem(
        page, JSON.stringify(pageSeed(page, seed, payload))
      );

      await dataUpdate(payload);

      disableMutation = true;
      map.get(); // force mount if not done yet
      disableMutation = false;
    });

    return map;
  } else {
    throw new Error(`${storeType}:${page} map was already created`);
  }
}

/**
 * Launch a series of refresh-data requests from the page request seed.
 * Defaults to getting/refreshing the 'app' storeType for the page.
 * Eventually results in 'pageDataUpdate' getting called.
 *
 * @param {String} page - The page, document name
 * @param {Object} [filterObject] - Request seed filter @see data.js/filterSeed
 * @param {Array} [filterObject.storeTypes] - The storeTypes to update
 * @param {Array} [filterObject.collections] - The collections to update
 */
export async function updatePageData (page, filter = {
  storeTypes: ['app']
}) {
  const seed = JSON.parse(localStorage.getItem(page));
  const filteredSeed = filterSeed(page, seed, filter);

  if ('serviceWorker' in navigator && filteredSeed) {
    const reg = await navigator.serviceWorker.ready;
    for (const [, payload] of Object.entries(filteredSeed)) {
      debug(`${page} Sending 'refresh-data' action to service worker`, payload);

      reg.active.postMessage({ 
        action: 'refresh-data',
        payload
      });
    }
  }
}

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
function pageSeed (page, seed = {}, next = null) {
  if (!next) {
    return seed;
  }

  const newCollections = next.keys.reduce((acc, [doc, col]) => {
    if (doc === page) {
      acc.push(col);
    }
    return acc;
  }, []);

  seed[`${next.storeType}:${page}`] = {
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
function filterSeed (page, seed, {
  storeTypes = ['app', 'user'],
  collections = []
} = {}) {
  if (!seed) {
    return seed;
  }

  const inputColl = new Set(collections);

  return Object.entries(seed).reduce((acc, [key, payload]) => {
    const payloadColl = new Set(payload.collections);
    const [keyType, keyPage] = key.split(':');

    if (storeTypes.includes(keyType) && page === keyPage) {
      const filteredColl = [...payloadColl.intersection(inputColl)];

      acc[`${keyType}:${keyPage}`] = {
        storeType: keyType,
        document: keyPage,
        collections: !filteredColl.length ? undefined : filteredColl
      };
    }

    return acc;
  }, {});
}

/**
 * Main handler for 'database-data-update' message from the service worker.
 * Updates memory store backing, and sends the notifications.
 *
 * @param {Object} - window.App database-data-update event payload destructure
 */
async function dataUpdate ({ dbname, storeType, storeName, keys }) {
  if (!db) {
    db = await openDB(dbname);
  }
  if (!storeNames.has(storeType)) {
    storeNames.set(storeType, storeName);
  }

  for (const [docName, colName] of keys) {
    const entry = await db.get(storeName, [docName, colName]);
    const key = `${storeType}:${docName}:${colName}`;
    const value = entry.properties;

    storageMemory[key] = value; // update the backing memory directly
    onChange(key, value);
  }
}

/**
 * Update the database, notify listeners, queue the backend mutation request.
 * 
 * @param {String} op - 'put' or 'delete'
 * @param {String} key - The collection name
 * @param {Object} [value] - The collection value
 * @returns 
 */
function queueMutation (op, key, value = null) {
  if (disableMutation) {
    return;
  }

  const keyParts = key.split(':');
  const storeType = keyParts[0];
  const keyPath = keyParts.slice(1);
  const storeName = storeNames.get(keyParts[0]);

  const param = op == 'delete' ? keyPath : {
    document_name: keyPath[0],
    collection_name: keyPath[1],
    properties: value
  };

  // Schedule microTask to update db, queue remote sync
  Promise.resolve()
    .then(() => db[op](storeName, param))
    .then(() => {
      if ('serviceWorker' in navigator) {
        return navigator.serviceWorker.ready;
      }
      return null;
    })
    .then(reg => {
      reg?.active.postMessage({
        action: 'batch-update',
        payload: {
          storeType,
          document: keyPath[0],
          collection: keyPath[1],
          op
        }
      });
    });
}

/**
 * The proxy in front of the storageMemory backing the persistentMap
 */
const storage = new Proxy(storageMemory, {
  set(target, name, value) {
    target[name] = value;
    onChange(name, value);
    queueMutation('put', name, value);
    return true;
  },
  get(target, name) {
    return target[name];
  },
  deleteProperty(target, name) {
    delete target[name];
    onChange(name, undefined);
    queueMutation('delete', name);
    return true;
  }
});

/**
 * Call all the listeners with the changes.
 * 
 * @param {String} key - The full object key [app|user]:[document]:[collection]
 * @param {Object} newValue - The object of properties
 */
function onChange (key, newValue) {
  const event = { key, newValue };
  for (const i of listeners) {
    i(event);
  }
}

const events = {
  addEventListener (key, callback) {
    listeners.push(callback);
  },
  removeEventListener (key, callback) {
    listeners = listeners.filter(i => i !== callback);
  },
  perKey: true
};

/**
 * Set the peristence of the map to idb with batched network requests:
 */
setPersistentEngine(storage, events);