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
const waiters = [];
const store = {};
const storeNames = new Map();
const createdStores = new Map();

if ('serviceWorker' in navigator) {
  const reg = await navigator.serviceWorker.ready;
  swActive = reg.active;
}

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
    store[storeType] = {};
  }

  for (const [docName, colName] of keys) {
    const entry = await db.get(storeName, [docName, colName]);
    const value = entry.properties;

    store[storeType][docName] = store[storeType][docName] ?? {};
    store[storeType][docName][colName] = store[storeType][docName][colName] ?? {};

    const deletes = (new Set(Object.keys(store[storeType][docName][colName])))
      .difference(new Set(Object.keys(value)));
    for (const prop of deletes) {
      delete store[storeType][docName][colName][prop];
    }
    Object.assign(store[storeType][docName][colName], value);
    
    onChange('update', [storeType, docName, colName], value);
  }
}

/**
 * Compare proposedProperties with existing properties on the keyPath.
 * 
 * @param {String} storeName - The storeName
 * @param {String} keyPath - [document, collection] keyPath
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

    debug(`${keyPath} update was ${different ? 'different' : 'NOT different'}`);
  }

  return different;
}

/**
 * Perform the update(s) required to reflect the in memory store in idb.
 *   'put' only writes entire documents or [document, collections]
 *   'delete' allows document, collection, or property removal
 * 
 * @param {String} op - 'put' or 'delete'
 * @param {String} storeType - 'app' or 'user'
 * @param {Array} keyPath - The keyPath to the data [document, collection]
 * @param {String|Nullish} [propertyName] - The propertyName (required for property deletes)
 * @returns 
 */
async function performDatabaseUpdate (op, storeType, keyPath, propertyName = null) {
  debug('performDatabaseUpdate', op, storeType, keyPath, propertyName);

  const document = keyPath[0];
  const collection = keyPath[1];
  const storeName = storeNames.get(storeType);
  let result = false;

  switch (op) {
    case 'delete':
      if (collection) {
        if (propertyName) { // delete single property
          debug(`deleting propertyName '${propertyName}' from '${collection}'...`);
          const item = await db.get(storeName, keyPath);
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
          await db.delete(storeName, keyPath);
          debug(`deleted collection '${collection}'`);
          result = true;
        }
      } else { // delete the whole document
        debug(`deleting document '${document}'...`);
        const docs = await db.transaction(storeName, 'readwrite').store.index('document');
        for await (const cursor of docs.iterate(IDBKeyRange.only(document))) {
          await cursor.delete();
        }
        debug(`deleted document '${document}'`);
        result = true;
      }
      break;

    case 'put':
      if (collection) { // put collection and/or properties
        debug(`putting collection ${collection}...`);
        if (isDifferent(storeName, keyPath, store[storeType][document][collection])) {
          await db.put(storeName, {
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
          if (isDifferent(storeName, [document, coll], doc[coll] || {})) {
            changedOne = true;
            await db.put(storeName, {
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

  // Schedule task to update db, queue remote sync
  mutationQueue.push(async () => {
    const result = await performDatabaseUpdate(op, storeType, keyPath, propertyName);
    if (result && swActive) {
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

  const event = { key, value };
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
    deleteProperty(target, key) {
      delete target[key];
      onChange('delete', [...path, key], undefined);
      return true;
    }
  };
}

/**
 * Allow clients to listen to changes
 */
export const storeEvents = {
  addEventListener (listenKey, callback) {
    listeners.push(event => {
      const { key } = event;
      if (key.includes(listenKey)) callback(event);
    });
  },
  removeEventListener (key, callback) {
    listeners = listeners.filter(i => i !== callback);
  }
};

/**
 * Creates or retrieves the connected data store for the given storeType.
 * Sets up data service worker data update handling.
 * For a new store, this will block until 'database-data-update' message is sent.
 *
 * @param {String} storeType - 'app' or 'user'
 * @param {String} page - The page, document for use
 * @returns {Object} - The connected data store for the storeType
 */
export async function createStore (storeType, page) {
  if (createdStores.has(storeType)) {
    return createdStores.get(storeType);
  }

  debug(`Creating store for ${storeType}...`);

  const waiterForStore = new Promise(resolve => waiters.push(resolve));

  /**
   * Install the handler for pageDataUpdate network callbacks from the service worker
   * (window.App.add discards duplicate adds, returns false)
   * This either gets called immediately bc the service worker installed and has init data ready,
   * or called shortly after the page calls to requestPageData and is called back.
   * 
   * @param {Object} payload - The pageDataUpdate object
   * @param {String} payload.dbname - The database name
   * @param {String} payload.storeName - The full store name
   * @param {String} payload.storeType - 'app' or 'user'
   * @param {Array} payload.keys - An array of the collections that were updated
   */
  window.App.add('pageDataUpdate', async payload => {
    debug(`Page ${page} received pageDataUpdate from service worker`, payload);

    // Update the request seed for the page with any new data that arrived
    // TODO: review the need to key seeds by page. shouldn't key by storeType?
    const seed = JSON.parse(localStorage.getItem('seed')) || undefined;
    localStorage.setItem(
      'seed', JSON.stringify(pageSeed(page, seed, payload))
    );

    // Update the store, sends onChange 'update'
    await dataUpdate(payload);

    const releaseWaiter = waiters.shift();
    if (typeof releaseWaiter === 'function') releaseWaiter();
  });

  debug('Waiting for "database-data-update" message...');
  await waiterForStore;

  const connectedStore = new Proxy(store[storeType], createHandler([storeType]));
  createdStores.set(storeType, connectedStore);

  return connectedStore;
}