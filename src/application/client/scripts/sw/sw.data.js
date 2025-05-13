/**
 * Service Worker application data handling.
 * Handles indexeddb maintainence and synchronization with the remote database.
 * Handles offline/spotty network with background sync, polyfilled if required.
 * 
 * Build time replacements:
 *   API_VERSION - The X-Api-Version header value that corresponds to the api for this app version.
 *   SCHEMA_VERSION - The schema version corresponding to this app version.
 *
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */
import querystring from 'node:querystring';
import { openDB } from 'idb';
import { Queue } from 'workbox-background-sync'; // workbox-core
import { _private } from 'workbox-core';

const dbname = 'jam_build';
const storeTypes = ['app', 'user'];
const batchStoreType = 'batch';
const schemaVersion = SCHEMA_VERSION; // eslint-disable-line -- assigned at bundle time
const apiVersion = API_VERSION; // eslint-disable-line -- assigned at bundle time
const queueName = `${dbname}-requests-${apiVersion}`;
const { debug } = _private.logger || { debug: ()=> {} };
const batchTimer = 0;
const batchCollectionWindow = 10000;

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
      debug(`Queue ${queueName} already created`);
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
 * @param {String} storeType - 'app' or 'user'
 * @param {String} [document] - document name
 * @param {String|Array<String>} [collections] - collection name(s) to get
 */
export async function refreshData (storeType, document, collections) {
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
 * @param {String} storeType - 'app' or 'user'
 * @param {String} document - The document to which the update applies
 * @param {Array<String>} [collections] - The collections to upsert, omit for all
 */
export async function upsertData (storeType, document, collections = null) {
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
 * If input is Object|Array<Object> this assumes the data is already formatted.
 * 
 * @param {String} storeType - 'app' or 'user'
 * @param {String} document - The document to which the delete applies
 * @param {String|Array<String>|Object|Array<Object>} [collectionInput] - Collection name(s), or Object(s) of { collection: 'name', properties: ['propName'...] }
 */
export async function deleteData (storeType, document, collectionInput = null) {
  debug(`deleteData, ${storeType}:${document}`, collectionInput);
  
  if (!storeType || !document) {
    throw new Error('Bad input passed to deleteData');
  }

  const baseUrl = `/api/data/${storeType}`;
  let url = `${baseUrl}/${document}`;
  let collections = collectionInput;

  if (typeof collections === 'string') {
    url += `/${collections}`;
    collections = false;
  }

  if (Array.isArray(collections)) {
    if (collections.every(c => typeof c === 'string')) {
      collections = collections.map(colName => ({
        collection_name: colName
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

async function processBatchUpdates () {
  const storeName = makeStoreName(batchStoreType);
  const totalRecords = await db.count(storeName);

  if (totalRecords === 0) {
    debug(`Batch process skipped, no records found in the ${storeName}`);
    return;
  }

  const output = {
    put: [],
    delete: []
  };
  const network = {
    put: upsertData,
    delete: deleteData
  };
  
  debug(`processBatchUpdates processing ${totalRecords} records...`);

  // Sort in descending timestamp order
  // The latest updates are always first per storeType+document+collection+op
  const timestamps = await db.transaction(storeName).store.index('timestamp');

  let lastKey;
  for await (const cursor of timestamps.iterate(null, 'prev')) {
    const item = cursor.value;
    const key = `${item.storeType}${item.document}${item.collection}`;

    // A new unique collection entry, latest is first, that's the op we want
    if (key !== lastKey) {
      const duplicate = output[item.op].find(i => (
        i.storeType === item.storeType && i.document === item.document
      ));
      if (duplicate) {
        // If we've encountered this storeType+document for this op before, add to the collections
        if (!duplicate.collections.includes(item.collection)) { // check for old record
          duplicate.collections.push(item.collection);
        }
      } else {
        output[item.op].push({
          storeType: item.storeType,
          document: item.document,
          collections: [item.collection]
        });
      }
    }

    lastKey = key;
  }

  debug(`processBatchUpdates processing ${output.put.length} puts, ${output.delete.length} deletes...`, output);

  for (const op of Object.keys(output)) {
    for (const item of output[op]) {
      let deleteOK = true; // I can't think why this should be false right now, but give me time... maybe delete...
      try {
        await network[op](item.storeType, item.document, item.collections);
        debug(`processBatchUpdates '${network[op].name}' succeeded for '${op}' with '${item.storeType}:${item.document}'`, item.collections);
      }
      catch (e) {
        debug(`processBatchUpdates '${network[op].name}' failed for '${op}' with '${item.storeType}:${item.document}', will retry later, continuing...`, item.collections, e);
      }
      if (deleteOK) {
        const deleteRecords = await db.transaction(storeName, 'readwrite').store.index('delete');
        const indexCountBegin = await deleteRecords.count();
        for await (const cursor of deleteRecords.iterate([item.storeType, item.document, op])) {
          cursor.delete();
        }
        const indexCountEnd = await deleteRecords.count();
        debug(`processBatchUpdates '${op}' processed ${indexCountBegin - indexCountEnd} records for '${item.storeType}:${item.document}'`);
      }
    }
  }
}

/**
 * Queue a mutation record for batch processing.
 * Reset the batchCollectionWindow.
 * 
 * @param {String} storeType - 'app' or 'user'
 * @param {String} document - The document for these updates
 * @param {String} collection - The collection to update
 * @param {String} op - 'put' or 'delete'
 */
export async function batchUpdate (storeType, document, collection, op) {
  debug(`batchUpdate, ${storeType}:${document}:${collection}:${op}`);

  clearTimeout(batchTimer);

  if (!storeType || !document || !collection || !op) {
    throw new Error('Bad input passed to batchUpdate');
  }

  const storeName = makeStoreName(batchStoreType);
  await db.put(storeName, {
    storeType, document, collection, op, timestamp: Date.now()
  });

  debug(`batchCollectionWindow reset to ${batchCollectionWindow}`);

  setTimeout(processBatchUpdates, batchCollectionWindow);
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
        // storeType, document, collection, op, timestamp
        const store = db.createObjectStore(batchStoreName, {
          keyPath: ['storeType', 'document', 'timestamp'] // there might be duplicate collections, op
        });
        store.createIndex('timestamp', ['timestamp'], {
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
  
  await refreshData('app');
}