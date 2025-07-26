/**
 * Application data updates and store creation.
 * 
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */
import { openDB } from 'idb';
import debugLib from '@localnerve/debug';
import { fastIsEqual } from '@localnerve/fast-is-equal';
import { pageSeed } from './seed.js';

const debug = debugLib('data');

let db;
let swActive;
let listeners = [];
const waiters = {};
const store = {};
const storeNames = new Map();
const dataScopes = new Map();
const createdStores = new Map();

if ('serviceWorker' in navigator) {
  const reg = await navigator.serviceWorker.ready;
  swActive = reg.active;
}

/**
 * Main handler for 'database-data-update' message from the service worker.
 * Updates memory store backing, and sends the 'update' notifications.
 *
 * @param {Object} params - window.App 'database-data-update' event payload
 * @param {String} params.dbname - The database name
 * @param {String} params.storeType - The storeType [store:scope]
 * @param {String} params.storeName - The full, versioned objectStore name 
 * @param {String} params.scope - The data scope part of the key
 * @param {Array} params.keys - The document part of the key [doc, col]
 */
async function dataUpdate ({ dbname, storeType, storeName, scope, keys }) {
  debug('"pageDataUpdate" notification recieved from service worker', dbname, storeType, storeName, scope, keys);

  if (!db) {
    db = await openDB(dbname);
  }

  if (!storeNames.has(storeType)) {
    storeNames.set(storeType, storeName);
    store[storeType] = {};
  }

  if (!dataScopes.has(storeType)) {
    dataScopes.set(storeType, scope);
  }

  if (keys.length === 0) { // No Data
    onChange('update', [storeType, '', ''], {});
  }

  for (const [docName, colName] of keys) {
    const entry = await db.get(storeName, [scope, docName, colName]);
    const value = entry.properties;

    store[storeType][docName] = store[storeType][docName] ?? {};
    store[storeType][docName][colName] = store[storeType][docName][colName] ?? {};

    if (value) {
      const deletes = (new Set(Object.keys(store[storeType][docName][colName])))
        .difference(new Set(Object.keys(value)));
      for (const prop of deletes) {
        delete store[storeType][docName][colName][prop];
      }
    }
    Object.assign(store[storeType][docName][colName], value);
    
    onChange('update', [storeType, docName, colName], value);
  }
}

/**
 * Compare proposedProperties with existing properties on the keyPath.
 * 
 * @param {String} storeName - The storeName
 * @param {String} keyPath - [scope, document, collection] keyPath
 * @param {Object} proposedProperties - The new, proposedProperties
 * @returns {Boolean} true if the proposedProperties are different than existing, false otherwise
 */
async function isDifferent(storeName, keyPath, proposedProperties) {
  let existing = { properties: { __alwaysDifferent__: true } };

  try {
    existing = await db.get(storeName, keyPath);
  } catch (e) {
    debug(`isDifferent could not get from ${storeName}, keyPath: ${keyPath}`, e);
  }

  let different = true;
  if (existing) {
    const { properties: existingProperties } = existing;
    different = !fastIsEqual(existingProperties, proposedProperties);
  }

  debug(`${keyPath} update was ${different ? 'different' : 'NOT different'}`);

  return different;
}

/**
 * Perform the update(s) required to reflect the in memory store in idb.
 *   'put' only writes entire documents or [document, collections]
 *   'delete' allows document, collection, or property removal
 * 
 * @param {String} op - 'put' or 'delete'
 * @param {String} storeType - A keyPath to the document
 * @param {Array} keyPath - The keyPath to the data [document, collection]
 * @param {String|Nullish} [propertyName] - The propertyName (required for property deletes)
 * @returns 
 */
async function performDatabaseUpdate (op, storeType, keyPath, propertyName = null) {
  debug('performDatabaseUpdate', op, storeType, keyPath, propertyName);

  const scope = dataScopes.get(storeType);
  const document = keyPath[0];
  const collection = keyPath[1];
  const storeName = storeNames.get(storeType);
  let result = false;

  switch (op) {
    case 'delete':
      if (collection) {
        if (propertyName) { // delete single property
          debug(`deleting propertyName '${propertyName}' from '${collection}'...`);
          const item = await db.get(storeName, [scope, ...keyPath]);
          debug(`deleting propertyName '${propertyName}' from item.properties...`, item.properties);
          if (item.properties && propertyName in item.properties) {
            delete item.properties[propertyName];
            await db.put(storeName, item);
            debug(`deleted propertyName '${propertyName}' from '${collection}'`);
          }
          // If its not there, it might've already been removed from idb by a preceeding op.
          // Declare victory anyways, duplicates will be removed, and the remote service ignores non-existant property deletion attempts.
          result = true;
        } else { // delete whole collection
          debug(`deleting collection '${collection}'...`);
          await db.delete(storeName, [scope, ...keyPath]);
          debug(`deleted collection '${collection}'`);
          result = true;
        }
      } else { // delete the whole document
        debug(`deleting document '${document}'...`);
        const docs = await db.transaction(storeName, 'readwrite').store.index('document');
        for await (const cursor of docs.iterate(IDBKeyRange.only([scope, document]))) {
          await cursor.delete();
        }
        debug(`deleted document '${document}'`);
        result = true;
      }
      break;

    case 'put':
      if (collection) { // put collection and/or properties
        debug(`putting collection ${collection}...`);
        if (await isDifferent(storeName, [scope, ...keyPath], store[storeType][document][collection])) {
          await db.put(storeName, {
            scope,
            document_name: document,
            collection_name: collection,
            properties: store[storeType][document][collection]
          });
          debug(`put collection ${collection}`);
          result = true;
        }
      } else { // put whole document
        debug(`putting document '${document}'...`);
        let changedOne = false;
        const doc = store[storeType][document];
        for (const coll of Object.keys(doc)) {
          if (await isDifferent(storeName, [scope, document, coll], doc[coll] || {})) {
            changedOne = true;
            await db.put(storeName, {
              scope,
              document_name : document,
              collection_name: coll,
              properties: doc[coll] || {}
            });
          }
        }
        if (changedOne) {
          debug(`put document '${document}'`);
          result = true;
        }
      }
      break;
    
    default:
      break;
  }

  return result;
}

/**
 * Time batch mutation queue
 */
let mutationTimer = 0;
const mutationQueue = [];
async function serviceMutationQueue () {
  let mutation;
  const queue = mutationQueue.slice(0);
  mutationQueue.length = 0;
  while ((mutation = queue.shift())) {
    await mutation();
  }
}

/**
 * Update the database, notify listeners, queue the backend mutation request.
 * 
 * @param {String} op - 'put' or 'delete'
 * @param {Array} key - The keypath to the update [storeType, document, collection, propertyName]
 * @returns nothing
 */
function queueMutation (op, key) {
  debug(`queueMutation ${op} ${key}`);

  clearTimeout(mutationTimer);

  const storeType = key[0];
  const keyPath = key.slice(1, 3);
  const propertyName = key.length > 3 ? key[3] : null;
  const document = keyPath[0];
  const collection = keyPath[1]; // could be undefined

  if (swActive) {
    debug('Sending may-update...', op, key);

    swActive.postMessage({
      action: 'may-update',
      payload: {
        storeType,
        document,
        collection,
        op
      }
    });
  }

  // Schedule task to update db, queue remote sync
  mutationQueue.push(async () => {
    const result = await performDatabaseUpdate(op, storeType, keyPath, propertyName);
    if (swActive && result) {
      debug('Sending batch-update...', op, key);

      swActive.postMessage({
        action: 'batch-update',
        payload: {
          storeType,
          document,
          collection,
          propertyName,
          op
        }
      });
    }
  });

  mutationTimer = setTimeout(serviceMutationQueue, 67);
}

/**
 * Notify the listeners and schedule work for mutation ops.
 * 
 * @param {String} op - 'update', 'put', or 'delete'
 * @param {Array} key - The keypath of the update [storeType, document, collection, property]
 * @param {Object} [value] - Undefined for deletes
 */
function onChange(op, key, value) {
  debug('onChange: ', op, key, value);

  const event = { op, key, value };
  for (const i of listeners) {
    i(event);
  }

  // Must be a mutation on at least the document level
  if (['put', 'delete'].includes(op) && key.length > 1) {
    queueMutation(op, key);
  }
}

/**
 * Recursive proxy handler.
 * This formats the key into an array and sets the mutation op for changes.
 * This is the persistent nanostore pattern.
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
      target[key] = value;
      onChange('put', [...path, key], value);
      return true;
    },
    deleteProperty (target, key) {
      delete target[key];
      onChange('delete', [...path, key], undefined);
      return true;
    }
  };
}

/**
 * Find a subarray in an array.
 * 
 * @param {Array} mainArray - The array to search
 * @param {Array} subArray - The subarray to find
 * @returns {Boolean} true if found, false otherwise
 */
function containsSubarray(mainArray, subArray) {
  const n = mainArray?.length ?? -2;
  const m = subArray?.length ?? -1;

  // If subArray is longer than mainArray, or bad input, it can't be a subarray
  if (m > n || m < 0) return false;

  for (let i = 0; i <= n - m; i++) {
    let match = true;
    for (let j = 0; j < m; j++) {
      if (mainArray[i + j] !== subArray[j]) {
        match = false;
        break;
      }
    }
    if (match) return true;
  }

  return false;
}

/**
 * Allow clients to listen to changes
 */
export const storeEvents = {
  /**
   * Add a data event listener.
   * On any update or mutation, gets the key listened to and the new value.
   * 
   * @param {String|Array} listenOps - The operation(s) to listen for
   * @param {String|Array} listenKey - The key or complex key to listen for
   * @param {Function} callback - Receives { key, value }
   */
  addEventListener (listenOps, listenKey, callback) {
    const _listenKey = typeof listenKey === 'string' ? [listenKey] : listenKey;
    const _listenOps = typeof listenOps === 'string' ? [listenOps] : listenOps;

    listeners.push(event => {
      const { op, key, value } = event;

      const hasKey = containsSubarray(key, _listenKey);
      const hasOp = _listenOps.includes(op);

      if (hasKey && hasOp) {
        callback({
          op,
          key: _listenKey,
          value
        });
      }
    });
  },

  /**
   * Removes the event listener, matched by function.
   */
  removeEventListener (key, callback) {
    listeners = listeners.filter(i => i !== callback);
  }
};

/**
 * Creates or retrieves the connected data store for the given storeType.
 * Sets up data service worker data update handling.
 * For a new store, this will block until 'database-data-update' message is sent.
 *
 * @param {String} storeType - store:scope
 * @param {String} page - The page, document for use
 * @returns {Object} - The connected data store for the storeType
 */
export async function createStore (storeType, page) {
  if (createdStores.has(storeType)) {
    return createdStores.get(storeType);
  }

  debug(`Creating store for ${storeType}...`);

  const waiterForStore = new Promise(resolve => waiters[storeType] = resolve);

  /**
   * Install the handler for pageDataUpdate network callbacks from the service worker
   *   (window.App.add discards duplicate adds)
   * This either gets called immediately bc the service worker installed and has init data ready,
   * or called shortly after the page calls to requestPageData and is called back.
   * 
   * @param {Object} payload - The pageDataUpdate object
   * @param {String} payload.dbname - The database name
   * @param {String} payload.storeName - The full store name
   * @param {String} payload.storeType - A keyPath to the document
   * @param {Array} payload.keys - An array of the [doc, collection] keyPaths to the data that were updated
   * @param {Boolean} [payload.local] - Local db, no new data. Only uses local if no objectStore has been created
   * @param {Object} [payload.message] - If present, sends message to the UI
   * @param {String} [payload.message.text] - The text of the message
   * @param {String} [payload.message.class] - The presentation class
   */
  window.App.add('pageDataUpdate', async payload => {
    debug(`Page ${page} received pageDataUpdate from service worker`, payload);

    // Update the request seed for the page with any new data that arrived
    const seed = JSON.parse(localStorage.getItem('seed')) || undefined;
    localStorage.setItem(
      'seed', JSON.stringify(pageSeed(page, seed, payload))
    );

    // Update the store, sends onChange 'update'
    await dataUpdate(payload);

    // Queue any outgoing user message
    if (payload.message) {
      setTimeout(window.App.exec.bind(window.App, 'pageGeneralMessage', {
        args: {
          message: payload.message.text,
          class: payload.message.class,
          duration: 1500
        }
      }), 17);
    }

    // Release storeType waiter
    const releaseWaiter = waiters[payload.storeType];
    if (typeof releaseWaiter === 'function') releaseWaiter();
  });

  debug('Waiting for "database-data-update" message...');
  await waiterForStore;

  if (store[storeType]) {
    const connectedStore = new Proxy(store[storeType], createHandler([storeType]));
    createdStores.set(storeType, connectedStore);
    return connectedStore;
  }

  console.warn(`store ${storeType} was NOT populated after the wait`); // eslint-disable-line
  debug(`store '${storeType}' was NOT populated after the wait`);
  return null;
}