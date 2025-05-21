/**
 * Service Worker application data handling.
 * Handles indexeddb maintainence and synchronization with the remote database.
 * Handles offline/spotty network with background sync, polyfilled if required.
 * 
 * Build time replacements:
 *   API_VERSION - The X-Api-Version header value that corresponds to the api for this app version.
 *   SCHEMA_VERSION - The schema version corresponding to this app version.
 *   process.env.NODE_ENV - 'production' or not
 *
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */
import querystring from 'node:querystring';
import { openDB } from 'idb';
import { Queue } from 'workbox-background-sync'; // workbox-core
import { _private } from 'workbox-core';
import { startTimer } from './sw.timer.js';

const dbname = 'jam_build';
const storeTypes = ['app', 'user'];
const batchStoreType = 'batch';
const schemaVersion = SCHEMA_VERSION; // eslint-disable-line -- assigned at bundle time
const apiVersion = API_VERSION; // eslint-disable-line -- assigned at bundle time
const queueName = `${dbname}-requests-${apiVersion}`;
const { debug } = _private.logger || { debug: ()=> {} };
const batchCollectionWindow = process?.env?.NODE_ENV !== 'production' ? 20000 : 3000; // eslint-disable-line -- assigned at bundle time

let blocked = false;
let db;

/**
 * RE: background sync setup -
 * Chrome will warn 'sync' must be top-level script hook to catch events. Not true,
 * you'll miss the very first event only. This is a happy compromise:
 * 'sync' in self.registration is NOT good enough, setupBackgroundRequests handles properly.
 *    @see sw.custom.js for the call on 'message' ln-background-sync-support-test.
 * Some popular browser vendors (brave) make the namespace, but DONT IMPLEMENT 🙁
 */
let canSync = 'sync' in self.registration;
let queue;
export function setupBackgroundRequests (syncSupport) {
  debug('setupBackgroundRequests, support:', syncSupport);

  try {
    if (!queue) {
      queue = new Queue(queueName, {
        forceSyncFallback: !syncSupport,
        maxRetentionTime: 60 * 72, // 72 hours
        onSync: replayQueueRequestsWithDataAPI
      });
      debug('Sync queue created: ', queue);
      canSync = true;
    } else {
      debug(`Sync queue '${queueName}' already created`);
    }
  } catch (e) {
    debug(`Couldn't create Workbox Background Sync Queue ${e.name}`);
    canSync = false;
  }
}

/**
 * Substitute for stock workbox Queue.replayRequests.
 * Updates local data for GETs and sends notifications to the app.
 * Processes any left over batchUpdates.
 */
async function replayQueueRequestsWithDataAPI ({ queue }) {
  debug('Replaying queue requests...', queue);

  if (!queue) {
    throw new _private.WorkboxError('queue-replay-failed', {name: queueName});
  }

  let asyncResponseHandler = null;
  let entry;
  while ((entry = await queue.shiftRequest())) {
    try {
      if (entry.request.method === 'GET' && entry.metadata) {
        asyncResponseHandler = async data => {
          const { storeType } = entry.metadata;
          await storeData(storeType, data);
        };
      }
      await dataAPICall(entry.request.clone(), {
        asyncResponseHandler,
        retry: false
      });
    } catch {
      debug('Failed to replay request: ', entry.request.url);
      await queue.unshiftRequest(entry);
      throw new _private.WorkboxError('queue-replay-failed', {name: queueName});
    }
  }

  await processBatchUpdates();
}

/**
 * Make the storeName from the storeType.
 * 
 * @param {String} storeType - 'app' or 'user'
 * @param {Number|String} [version] - The schema version, defaults to this version as compiled
 * @returns {String} The objectStore name
 */
function makeStoreName (storeType, version = schemaVersion) {
  return `${storeType}_documents_${version}`;
}

/**
 * Send a message to all the open application tabs.
 *
 * @param {String} meta - The meta message identifier
 * @param {Any} [payload] - The message payload
 */
async function sendMessage (meta, payload) {
  if (self.clients) {
    const clients = await self.clients.matchAll();

    for (let i = 0; i < clients.length; i++) {
      clients[i].postMessage({
        meta,
        payload
      });
    }
  }
}

/**
 * Get a reference to the database.
 * 
 * @returns {IDBDatabase} An idb enhanced interface to an open IDBDatabase
 */
async function getDB () {
  if (!db) {
    db = await openDB(dbname, schemaVersion);
  }
  return db;
}

/**
 * Make a network request to the remote data service.
 *
 * @param {Request} request - The request object
 * @param {Object} [options] - options to handle data and control replay failure behavior
 * @param {AsyncFunction} [options.asyncResponseHandler] - data response handler
 * @param {Object} [options.metadata] - metadata to be stored with the Request on replay
 * @param {Boolean} [options.retry] - true if failures should be queued for replay
 */
async function dataAPICall (request, {
  asyncResponseHandler = null,
  metadata = null,
  retry = true
} = {}) {
  debug('dataAPICall ', request.url);

  let response = null;
  try {
    response = await fetch(request);
    if (response.ok) {
      if (typeof asyncResponseHandler === 'function') {
        const data = await response.json();
        await asyncResponseHandler(data);
      }
    } else {
      throw new Error(`[${response.status}] ${request.method} ${request.url}`);
    }
  } catch (error) {
    debug('dataAPICall failed', error.message);

    if (canSync && retry && !response) {
      queue.pushRequest({
        request,
        metadata
      });
    } else {
      throw error;
    }
  }
}

/**
 * Store data in the jam_build database.
 * Re-formats data from the network to the idb objectStore format.
 *
 * @param {String} storeType - 'app' or 'user'
 * @param {Object} data - The remote data to store
 */
async function storeData (storeType, data) {
  const storeName = makeStoreName(storeType);
  const keys = [];
  const db = await getDB();

  // Format and store the data
  for (const [doc_name, col] of Object.entries(data)) {
    for (const [col_name, props] of Object.entries(col)) {
      keys.push([doc_name, col_name]);
      await db.put(storeName, {
        document_name: doc_name,
        collection_name: col_name,
        properties: props
      });
    }
  }

  // Notify the front-end app
  await sendMessage('database-data-update', {
    dbname,
    storeName,
    storeType,
    keys
  });
}

/**
 * Load data from an objectStore by document name or document and collection name(s).
 * Format them for upsert to the remote data service.
 *
 * @param {String} storeType - 'app' or 'user'
 * @param {String} document - The document name
 * @param {Array<String>} [collections] - An array of collection names
 */
async function loadData (storeType, document, collections = null) {
  const result = { collections: [] };
  const storeName = makeStoreName(storeType);
  const db = await getDB();

  if (!collections) {
    const idbResults = await db.getAllFromIndex(storeName, 'document', document);
    for (const idbResult of idbResults) {
      result.collections.push({
        collection: idbResult.collection_name,
        properties: {
          ...idbResult.properties
        }
      });
    }
  } else {
    for (const collection of collections) {
      const idbResult = await db.get(storeName, [document, collection]);
      result.collections.push({
        collection,
        properties: {
          ...idbResult.properties
        }
      });
    }
  }

  return result;
}

/**
 * Refresh the local store copy with remote data.
 *
 * @param {Object} payload - payload parameters
 * @param {String} payload.storeType - 'app' or 'user'
 * @param {String} [payload.document] - document name
 * @param {String|Array<String>} [payload.collections] - collection name(s) to get
 */
export async function refreshData ({ storeType, document, collections }) {
  debug(`refreshData, ${storeType}:${document}`, collections);

  const baseUrl = `/api/data/${storeType}`;
  const path = document ? `/${document}${
    typeof collections === 'string' ? `/${collections}`
      : collections?.length === 1 ? `/${collections[0]}` : ''
  }`: '';
  let url = `${baseUrl}${path}`;

  if (document && collections?.length > 1) {
    const query = querystring.stringify({ collections });
    url += `?${query}`;
  }

  const request = new Request(url, {
    headers: {
      'X-Api-Version': apiVersion,
      'Content-Type': 'application/json'
    }
  });

  await dataAPICall(request, {
    asyncResponseHandler: async data => {
      await storeData(storeType, data);
    },
    metadata: {
      storeType
    }
  });
}

/**
 * Synchronize local data updates with the remote data service.
 * 
 * @param {Object} payload - payload parameters
 * @param {String} payload.storeType - 'app' or 'user'
 * @param {String} payload.document - The document to which the update applies
 * @param {Array<String>} [payload.collections] - The collections to upsert, omit for all
 */
export async function upsertData ({ storeType, document, collections = null }) {
  debug(`upsertData, ${storeType}:${document}`, collections);

  if (!storeType || !document) {
    throw new Error('Bad input passed to upsertData');
  }

  const baseUrl = `/api/data/${storeType}`;
  const url = `${baseUrl}/${document}`;

  const body = await loadData(storeType, document, collections);

  const request = new Request(url, {
    method: 'POST',
    headers: {
      'X-Api-Version': apiVersion,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  await dataAPICall(request);
}

/**
 * Synchronize local data deletions with the remote data service.
 * Formats data for the delete api methods if input is String|Array<String>.
 * If input is Object|Array<Object> this assumes the data is already formatted properly.
 * 
 * @param {Object} payload - parameters
 * @param {String} payload.storeType - 'app' or 'user'
 * @param {String} payload.document - The document to which the delete applies
 * @param {String|Array<String>|Object|Array<Object>} [payload.collections] - Collection name(s), or Object(s) of { collection: 'name', properties: ['propName'...] }
 */
export async function deleteData ({ storeType, document, collections }) {
  debug(`deleteData, ${storeType}:${document}`, collections);
  
  if (!storeType || !document) {
    throw new Error('Bad input passed to deleteData');
  }

  const baseUrl = `/api/data/${storeType}`;
  let url = `${baseUrl}/${document}`;

  if (typeof collections === 'string') {
    url += `/${collections}`;
    collections = false; // eslint-disable-line no-param-reassign
  }

  if (Array.isArray(collections)) {
    if (collections.every(c => typeof c === 'string')) {
      collections = collections.map(colName => ({ // eslint-disable-line no-param-reassign
        collection: colName
      }));
    }
  }

  const request = new Request(url, {
    method: 'DELETE',
    headers: {
      'X-Api-Version': apiVersion,
      'Content-Type': 'application/json'
    },
    body: collections ? JSON.stringify({ collections }) : undefined
  });

  await dataAPICall(request);
}

/**
 * Reads the batch database, processes the records, performs the required actions to
 * synchronize the remote data service.
 * Presumes the local idb is the source of truth that need to be conveyed to the remote data service.
 * Called from the batch timer @see batchUpdate, or on sync event or equivalent.
 * 
 * @returns {Promise<undefined>} fulfills when the function completes.
 */
async function processBatchUpdates () {
  const storeName = makeStoreName(batchStoreType);
  const db = await getDB();
  const totalRecords = await db.count(storeName);

  if (totalRecords === 0) {
    debug(`Batch process skipped, no records found in the ${storeName}`);
    return;
  }

  const output = {
    // Property order here controls network call order.
    // Keys (ops) are iterated by ascending chronological order of property creation...
    // Because we use upserts, deletes must come last
    put: [],
    delete: []
  };
  const network = { // map output ops to calls
    put: upsertData,
    delete: deleteData
  };
  
  debug(`processBatchUpdates processing ${totalRecords} records...`);

  // For iterating in descending id+storeType+document+collection order
  // The latest updates are always first per storeType+document+collection, op+prop vary
  const batch = await db.transaction(storeName).store.index('batch');
  // batch is sorted by key ['id', 'storeType', 'document', 'collection'] 

  // vvvv Complex code alert vvvv
  // Loop through batch records and build network calls.
  // This loop enforces additional constraints in the reverse id order sort.
  // (needed because we have asymmetry in allowing property level deletes, not just collection, but puts are always only collection level)
  // This complexity was introduced by requiring property consideration just for deletes.
  // 1. newer deletes always override older matching puts (older puts that match with newer deletes are discarded):
  //    - matching precedence: a. whole document, b. whole collection, c. single property
  //      - If any of these match, the older puts and deletes have to be discarded
  //    - In the case where older put does not overlap with a newer delete, both are executed, put first then delete
  // 2. older puts merge collection with newer matching puts, except whole document puts
  // 3. older deletes merge properties with newer matching deletes, except whole document or collection deletes
  // 4. presumes newer puts could not be made on deleted items (code should not compile or crash before).

  let lastKey;
  for await (const cursor of batch.iterate(null, 'prev')) { // latest arrival (autoincrement id) first
    const item = cursor.value;
    const key = `${item.storeType}:${item.document}:${item.collection}:${item.propertyName}`;

    debug('processBatchUpdates loop: ', item.op, key);

    if (key !== lastKey) {
      const deletedLater = output.delete.find(i => {
        const matchingDoc = i.storeType === item.storeType && i.document === item.document;
        if (matchingDoc && i.collections.length === 0) {
          return i; // whole doc was deleted later, this item is irrelevant
        }
        const matchingDocCol = matchingDoc && i.collections.includes(item.collection);
        const props = i.properties.get(item.collection);
        if (matchingDocCol && !props.length) {
          return i; // whole collection was deleted later, this item is irrelevant
        }
        if (matchingDocCol && props.includes(item.propertyName)) {
          return i; // property was deleted later, this item is irrelevant
        }
      });
      let sameOpDuplicate = false;
      if (!deletedLater) {
        sameOpDuplicate = output[item.op].find(i => (
          i.storeType === item.storeType && i.document === item.document
        ));
        if (sameOpDuplicate) {
          // if there are ZERO collections, a full doc put or delete came later, discard this item
          if (sameOpDuplicate.collections.length > 0 && item.collection) {
            if (sameOpDuplicate.collections.length > 0 && !sameOpDuplicate.collections.includes(item.collection)) {
              sameOpDuplicate.collections.push(item.collection);
            }
            let props = sameOpDuplicate.properties?.get(item.collection);
            if (props) {
              // If there's an existing delete with 0 props, its for the whole collection, discard this item
              if (props.length > 0 && item.propertyName && !props.includes(item.propertyName)) {
                props.push(item.propertyName);
              }
            } else {
              props = sameOpDuplicate.properties?.set(item.collection, item.propertyName ? [item.propertyName] : []);
              if (props) {
                props.hasProps = props.hasProps || (item.propertyName ? true : false);
              }
            }
          }
        }
      }
      if (!sameOpDuplicate && !deletedLater) {
        let properties;
        if (item.op === 'delete') { // deletes can have properties
          if (item.collection) {
            properties = (new Map()).set(item.collection, item.propertyName ? [item.propertyName] : []);
            properties.hasProps = item.propertyName ? true : false;
          } else { // this is a document delete
            properties = { set(){}, get(){}, hasProps: false };
          }
        }
        output[item.op].push({
          storeType: item.storeType,
          document: item.document,
          collections: item.collection ? [item.collection] : [],
          properties
        });
      }
    }

    lastKey = key;
  }

  debug(`processBatchUpdates processing ${output.put.length} puts, ${output.delete.length} deletes...`, output);

  const reconcile = [];
  for (const op of Object.keys(output)) {
    for (const item of output[op]) {
      const request = { ...item };
      if (request.properties?.hasProps) {
        request.collections = request.collections.map(collection => ({
          collection,
          properties: request.properties.get(collection)
        }));
      }
      try {
        await network[op](request);
        debug(`processBatchUpdates '${network[op].name}' completed for '${op}' with '${request.storeType}:${request.document}'`, {
          ...request.collections
        });
      }
      catch (e) {
        const failedItem = reconcile.find(i => i.storeType === item.storeType && i.document === item.document);
        if (failedItem) {
          const newColl = (new Set(item.collections)).difference(new Set(failedItem.collections));
          failedItem.collections.push(...newColl);
        } else {
          reconcile.push(item);
        }
        debug(`processBatchUpdates '${network[op].name}' FAILED for '${op}' with '${request.storeType}:${request.document}', continuing...`, {
          ...request.collections
        }, e);
      }

      // Always delete. If it threw, it's not going to work by retrying, the input is bad
      const deleteRecords = await db.transaction(storeName, 'readwrite').store.index('delete');
      let count = 0;
      for await (const cursor of deleteRecords.iterate([item.storeType, item.document, op])) {
        count++;
        await cursor.delete();
      }
      debug(`processBatchUpdates '${op}' processed ${count} records for '${item.storeType}:${item.document}'`);
    }
  }

  // This only happens if the remote data service errors on the input
  // The local copy is out of sync with the remote service, reconcile contains all the failed items
  // TODO: find the exact reasons this could occur, revisit user notification strategy
  // TODO: if refresh fails, what next? if doc/collection doesn't exist (is new) it will fail 404 not found
  for (const request of reconcile) {
    debug('Reconciling by refreshData ', { ...request });
    try {
      await refreshData(request);
    } catch (e) {
      debug(`Failed to reconcile ${request.storeType}:${request.document}`, { ...request }, e);
    }
  }
}

/**
 * Queue a mutation record for batch processing.
 * Reset the batchCollectionWindow.
 * 
 * @param {Object} payload - The message payload object
 * @param {String} payload.storeType - 'app' or 'user'
 * @param {String} payload.document - The document for these updates
 * @param {String} payload.op - 'put' or 'delete'
 * @param {String} [payload.collection] - The collection to update
 * @param {String} [payload.propertyName] - The property name to delete, op must === 'delete'
 */
export async function batchUpdate ({ storeType, document, op, collection, propertyName }) {
  if (!storeType || !document || !op) {
    throw new Error('Bad input passed to batchUpdate');
  }

  startTimer(batchCollectionWindow, 250, 'batch-timer', processBatchUpdates);

  /* eslint-disable no-param-reassign */
  collection = collection ?? '';
  propertyName = propertyName ?? '';
  /* eslint-enable no-param-reassign */

  debug(`batchUpdate db.add ${storeType}:${document}:${collection}:${propertyName}:${op}`);
  // console.log(`batchUpdate db.put ${storeType}:${document}:${collection}:${propertyName}:${op}`); // eslint-disable-line

  const db = await getDB();
  await db.add(makeStoreName(batchStoreType), {
    storeType, document, collection, propertyName, op
  });
}

/**
 * The service worker install lifecycle handler.
 */
export async function installDatabase () {
  /* eslint-disable no-unused-vars */
  db = await openDB(dbname, schemaVersion, {
    upgrade(db, oldVersion, newVersion, transaction, event) {

      // upgrade storeType objectStores...
      for (const storeType of storeTypes) {
        const storeName = makeStoreName(storeType);
        
        if (!db.objectStoreNames.contains(storeName)) {
          const store = db.createObjectStore(storeName, {
            keyPath: ['document_name', 'collection_name'] 
          });
          store.createIndex('document', 'document_name', {
            unique: false
          });
          store.createIndex('collection', 'collection_name', {
            unique: false
          });
        }
    
        // Do future migrations of storeType objectStores here...

        // Cleanup all old objectStores after migration
        // deleteObjectStore can only be called in a version event transaction (like here).
        for (let oldVersion = schemaVersion - 1; oldVersion > -1; oldVersion--) {
          let oldStoreName = makeStoreName(storeType, oldVersion);
          if (db.objectStoreNames.contains(oldStoreName)) {
            db.deleteObjectStore(oldStoreName);
          }
        }
      }

      // Upgrade bachUpdate objectStore...
      const batchStoreName = makeStoreName(batchStoreType);
      if (!db.objectStoreNames.contains(batchStoreName)) {
        const store = db.createObjectStore(batchStoreName, {
          keyPath: 'id',
          autoIncrement: true
        });
        store.createIndex('batch', ['id', 'storeType', 'document', 'collection'], {
          unique: true
        });
        store.createIndex('delete', ['storeType', 'document', 'op'], {
          unique: false
        });
      }

      // Do future migrations of batchUpdate objectStore here...

      // Cleanup all old objectStores after migration
      // deleteObjectStore can only be called in a version event transaction (like here).
      for (let oldVersion = schemaVersion - 1; oldVersion > -1; oldVersion--) {
        let oldStoreName = makeStoreName(batchStoreType, oldVersion);
        if (db.objectStoreNames.contains(oldStoreName)) {
          db.deleteObjectStore(oldStoreName);
        }
      }
    },
    blocked(currentVersion, blockedVersion, event) {
      blocked = true;
    },
    async blocking(currentVersion, blockedVersion, event) {
      db.close();
      await sendMessage('database-update-required');
    }
  });
  /* eslint-enable no-unused-vars */
}

/**
 * The service worker activate lifecycle handler
 */
export async function activateDatabase () {
  if (blocked) {
    blocked = false;
    await installDatabase();
  }
  
  await refreshData({ storeType: 'app' });
}