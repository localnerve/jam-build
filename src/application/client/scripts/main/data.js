/**
 * Application data updates and store creation.
 * 
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */
import { openDB } from 'idb';
import debugLib from '@localnerve/debug';
import { pageSeed } from './seed.js';

const debug = debugLib('data');

let db;
let listeners = [];
const store = {};
const storeNames = new Map();
const createdStores = new Set();

/**
 * Main handler for 'database-data-update' message from the service worker.
 * Updates memory store backing, and sends the notifications.
 *
 * @param {Object} params - window.App 'database-data-update' event payload
 * @param {String} params.dbname - The database name of the update
 * @param {String} params.storeType - The storeType 'app' or 'user'
 * @param {String} params.storeName - The objectStore name of the update
 * @param {Array} params.keys - The objectStore keys of the update
 */
async function dataUpdate ({ dbname, storeType, storeName, keys }) {
  debug('"pageDataUpdate" notification recieved from service worker', dbname, storeType, storeName, keys);

  if (!db) {
    db = await openDB(dbname);
  }

  if (!storeNames.has(storeType)) {
    storeNames.set(storeType, storeName);
  }

  for (const [docName, colName] of keys) {
    const entry = await db.get(storeName, [docName, colName]);
    const value = entry.properties;

    store[storeType] = store[storeType] ?? {};
    store[storeType][docName] = store[storeType][docName] ?? {};
    store[storeType][docName][colName] = store[storeType][docName][colName] ?? {
      ...value
    };

    onChange('update', [storeType, docName, colName], value);
  }
}

/**
 * Update the database, notify listeners, queue the backend mutation request.
 * 
 * @param {String} op - 'put' or 'delete'
 * @param {Array} key - The keypath to the update
 * @param {Object} [value] - The collection value
 * @returns 
 */
function queueMutation (op, key, value = null) {
  const storeType = key[0];
  const keyPath = key.slice(1, 3);
  const propertyName = key.slice(3);
  const document = keyPath[0];
  const collection = keyPath[1];
  const storeName = storeNames.get(storeType);

  const param = op == 'delete' ? keyPath : {
    document_name: document,
    collection_name: collection,
    properties: value
  };

  // Schedule microTask to update db, queue remote sync
  Promise.resolve()
    .then(() => db[op](storeName, param))
    .then(() => {
      if ('serviceWorker' in navigator) {
        return navigator.serviceWorker.ready.then(reg => {
          reg.active.postMessage({
            action: 'batch-update',
            payload: {
              storeType,
              document,
              collection,
              propertyName, // TODO: make sure this is handled in sw.data
              op
            }
          });
        });
      }
    });
}

/**
 * 
 * @param {String} op - 'update', 'put', or 'delete'
 * @param {Array} key - The keypath of the update
 * @param {Object} value 
 */
function onChange(op, key, value) {
  debug('onChange: ', op, key, value);

  const event = { key, value };
  for (const i of listeners) {
    i(event);
  }

  if (['put', 'delete'].includes(op)) {
    queueMutation(op, key, value);
  }
}

/**
 * Recursive proxy handler.
 * 
 * @param {Array} path - The keypath to 'here'
 * @returns {Object} The proxy handler for this keypath
 */
function createHandler (path = []) {
  return {
    get: (target, key) => {
      if (key === 'isProxy') return true;
      if (typeof target[key] === 'object' && target[key] !== null) {
        return new Proxy(target[key], createHandler([...path, key]));
      }
      return target[key];
    },
    set: (target, key, value) => {
      onChange('put', [...path, key], value);
      target[key] = value;
      return true;
    },
    deleteProperty(target, key) {
      onChange('delete', [...path, key], undefined);
      delete target[key];
      return true;
    }
  };
}

export const storeEvents = {
  addEventListener (listenKey, callback) {
    listeners.push(event => {
      const { key } = event;
      if (key.includes(listenKey)) callback();
    });
  },
  removeEventListener (key, callback) {
    listeners = listeners.filter(i => i !== callback);
  }
};

/**
 * Creates the connected data store for the given page.
 * Sets up data service worker data update handling.
 * Should only be called once per page load.
 *
 * @param {String} storeType - 'app' or 'user'
 * @param {String} page - The page, document of the map to get
 * @returns {Object} - The connected data store for the storeType
 */
export async function createStore (storeType, page) {
  if (!createdStores.has(`${storeType}:${page}`)) {
    debug(`Creating store for ${storeType}:${page}...`);

    let dataIsReady;
    const waitForStore = new Promise(resolve => dataIsReady = resolve);
  
    // Install the handler for pageDataUpdate network callbacks from the service worker
    // (window.App.add discards duplicate adds)
    const installed = window.App.add('pageDataUpdate', async payload => {
      debug(`Page ${page} received pageDataUpdate from service worker`, payload);

      const seed = JSON.parse(localStorage.getItem(page)) || undefined;
      localStorage.setItem(
        page, JSON.stringify(pageSeed(page, seed, payload))
      );

      await dataUpdate(payload);

      dataIsReady();
    });

    if (installed) {
      await waitForStore;
    }

    const connectedStore = new Proxy(store[storeType], createHandler([storeType]));
    createdStores.add(`${storeType}:${page}`);

    return connectedStore;
  } else {
    throw new Error(`${storeType}:${page} map was already created`);
  }
}