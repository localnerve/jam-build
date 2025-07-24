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
 * exports:
 *   setupBackgroundRequests - Setup offline request queue, sync event processing
 *   refreshData - Get the latest data from the remote data service
 *   batchUpdate - Make a mutation to the remote data service
 *   mayUpdate - Prepare for a mutation to the local data
 *   installDatabase - Sw install event handler
 *   activateDatabase - Sw activate event handler
 * 
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */
import querystring from 'node:querystring';
import * as jsonDiffPatchLib from 'jsondiffpatch';
import { openDB } from 'idb';
import { Queue } from 'workbox-background-sync'; // workbox-core
import { _private } from 'workbox-core';
import { startTimer } from './sw.timer.js';
import { sendMessage, CriticalSection } from './sw.utils.js';

const dbname = 'jam_build';
const mainStoreTypes = ['app', 'user'];
const versionStoreType = 'version';
const batchStoreType = 'batch';
const conflictStoreType = 'conflict';
const baseStoreType = 'base';
const schemaVersion = SCHEMA_VERSION; // eslint-disable-line -- assigned at bundle time
const apiVersion = API_VERSION; // eslint-disable-line -- assigned at bundle time
const queueName = `${dbname}-requests-${apiVersion}`;
const { debug } = _private.logger || { debug: ()=> {} };
const batchCollectionWindow = process?.env?.NODE_ENV !== 'production' ? 12000 : 12000; // eslint-disable-line -- assigned at bundle time
const E_REPLAY = 0x062de3cc;
const E_CONFLICT = 0x32c79766;
const STALE_BASE_LIFESPAN = 60000; // 1 minute, baseStoreType documents older than this are considered expired
const fetchTimeout = 4500;
const storeTypeDelim = ':';

const criticalSection = new CriticalSection();

const jsonDiffPatch = jsonDiffPatchLib.create({ omitRemovedValues: true });
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
let nativeSyncSupport;
let queue;
export function setupBackgroundRequests (syncSupport) {
  debug('setupBackgroundRequests, support:', syncSupport);
  nativeSyncSupport = syncSupport;

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

  if (canSync && !syncSupport && queue) {
    replayQueueRequestsWithDataAPI({ queue }); // replay now if artificial sync support
  }
}

/**
 * Substitute for stock workbox Queue.replayRequests.
 * Synchonrizes local/remote data, sends notifications to the app.
 * Processes any left over versionConflicts and batchUpdates.
 */
async function replayQueueRequestsWithDataAPI ({ queue }) {
  debug('Replaying queue requests...', queue);

  if (!queue) {
    throw new _private.WorkboxError('queue-replay-failed', {name: queueName});
  }

  const getRequests = [];
  const getResponseHandler = async (metadata, data) => {
    const { storeType, op, collections } = metadata;
    if (op === 'put' || op === 'delete') {
      return storeVersionConflict(storeType, op, collections, data);
    }
    await storeData(storeType, data);
  };
  const mutationResponseHandler = async (metadata, data) => {
    const { storeType, document, op } = metadata;
    await storeMutationResult(storeType, document, data);
    await clearBaseStoreRecords(storeType, document, op);
  };

  // Service mutation requests in fifo order, defer true GETs
  let entry;
  while ((entry = await queue.shiftRequest())) {
    try {
      const meta = entry.metadata;
      const method = entry.request.method;

      if (method === 'GET' && meta.op === 'get') {
        getRequests.push(entry);
      } else {
        await dataAPICall(entry.request, {
          asyncResponseHandler: method === 'GET' ?
            getResponseHandler.bind(null, meta) : mutationResponseHandler.bind(null, meta),
          metadata: meta,
          retry: false
        });
      }
    } catch {
      debug('Failed to replay mutation request: ', entry.request.url);

      await queue.unshiftRequest(entry);

      for (const get of getRequests) await queue.pushRequest(get);

      if (nativeSyncSupport) {
        // If native, throw to let the browser know this did not go as planned
        throw new _private.WorkboxError('queue-replay-failed', {name: queueName});
      }
    }
  } // while - mutation requests

  await processVersionConflicts();

  await processBatchUpdates();

  let reqKey;
  const completed = {};
  // Service ordinary GET requests, discard repeats
  for (const getEntry of getRequests) {
    try {
      const meta = getEntry.metadata;
      reqKey = `${meta.op}-${meta.storeType}-${meta.document}-${meta.collections}`;
      
      if (completed[reqKey]) {
        continue;
      }
      
      await dataAPICall(getEntry.request, {
        asyncResponseHandler: getResponseHandler.bind(null, meta),
        metadata: meta,
        retry: false
      });
      completed[reqKey] = true;
    } catch {
      debug('Failed to replay get request: ', getEntry.request.url);
      
      for (const get of getRequests) {
        const meta = getEntry.metadata;
        reqKey = `${meta.op}-${meta.storeType}-${meta.document}-${meta.collections}`;
        if (!completed[reqKey]) {
          await queue.pushRequest(get);
        }
      }
      if (nativeSyncSupport) {
        // If native, throw to let the browser know this did not go as planned
        throw new _private.WorkboxError('queue-replay-failed', {name: queueName});
      }
    }
  } // for - get requests
}

/**
 * Make the storeName from the storeType.
 * 
 * @param {String} storeType - store:scope
 * @param {Number|String} [version] - The schema version, defaults to this version as compiled
 * @returns {String} The objectStore name
 */
function makeStoreName (storeType, version = schemaVersion) {
  const type = storeType.split(storeTypeDelim)[0];
  return `${type}_documents_${version}`;
}

/**
 * Get the data scope from the storeType.
 * 
 * @param {String} storeType - store:scope
 * @returns {String} The data scope string value
 */
function getStoreTypeScope (storeType) {
  return storeType.split(storeTypeDelim)[1];
}

/**
 * Make the url fragement to the resource for the given storeType.
 * For now, just get the storeType store.
 * When multiple app level data scopes required, use scope for 'app' store.
 * 
 * @param {String} storeType - store:scope
 * @returns {String} The storeType resource
 */
function makeStoreTypeURLFragment (storeType) {
  return storeType.split(storeTypeDelim)[0];
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
 * Store put or delete successful mutation new version result.
 * 
 * @param {String} storeType - store:scope
 * @param {String} document - The document name
 * @param {String} result - The mutation result payload
 */
async function storeMutationResult (storeType, document, result) {
  const versionStoreName = makeStoreName(versionStoreType);
  const db = await getDB();

  await db.put(versionStoreName, {
    storeType,
    document,
    version: result.newVersion
  });
}

/**
 * Read data from local objectstores and send to the app.
 * localData is the fallback (stale) data in a Network First strategy.
 * 
 * @param {String} storeType - store:scope
 * @param {String} document - The document name
 * @param {String|Array<String>} [collections] - collection name(s) to get
 * @param {String} [message] - A user message
 */
async function localData (storeType, document, collections = null,
  message = 'A local copy of the data is being shown') {
  const storeName = makeStoreName(storeType);
  const scope = getStoreTypeScope(storeType);
  const db = await getDB();
  const keys = [];

  if (collections) {
    const colls = typeof collections === 'string' ? [collections] : collections;
    for (const collection of colls) {
      keys.push([document, collection]);
    }
  } else {
    const idbResults = await db.getAllFromIndex(storeName, 'document', [scope, document]);
    for (const idbResult of idbResults) {
      keys.push([document, idbResult.collection_name]);
    }
  }

  await sendMessage('database-data-update', {
    dbname,
    storeName,
    storeType,
    scope,
    keys,
    local: true,
    message: {
      text: message,
      class: 'info'
    }
  });
}

/**
 * Store data from the remote data service in the local object stores.
 * Re-formats data from the network to the idb objectStore format.
 * Sends message to the app with the new data.
 *
 * @param {String} storeType - store:scope
 * @param {Object} data - The remote data to store
 */
async function storeData (storeType, data) {
  const storeName = makeStoreName(storeType);
  const scope = getStoreTypeScope(storeType);
  const versionStoreName = makeStoreName(versionStoreType);
  const keys = [];
  const db = await getDB();

  // Format and store the data
  for (const [doc_name, doc] of Object.entries(data)) {
    // Store and strip the typed document version
    await db.put(versionStoreName, {
      storeType,
      document: doc_name,
      version: doc.__version
    });
    delete doc.__version;

    for (const [col_name, props] of Object.entries(doc)) {
      keys.push([doc_name, col_name]);
      await db.put(storeName, {
        scope,
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
    scope,
    keys
  });
}

/**
 * Load data from local objectStores by document name or document and possible collection name(s).
 * Format the local data for *upsert* to the remote data service.
 *
 * @param {String} storeType - store:scope
 * @param {String} document - The document name
 * @param {Array<String>} [collections] - An array of collection names
 */
async function loadData (storeType, document, collections = null) {
  const result = { collections: [] };
  const storeName = makeStoreName(storeType);
  const scope = getStoreTypeScope(storeType);
  const versionStoreName = makeStoreName(versionStoreType);
  const db = await getDB();

  let record = await db.get(versionStoreName, [storeType, document]);
  if (!record) {
    record = { version: 0 }; // Make a new document
    await db.put(versionStoreName, {
      storeType,
      document,
      version: record.version
    });
  }
  result.version = record.version;

  if (!collections || collections.length <= 0) {
    const idbResults = await db.getAllFromIndex(storeName, 'document', [scope, document]);
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
      const idbResult = await db.get(storeName, [scope, document, collection]);
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
 * Check request queue, batch queue, and conflict queue for pending updates (mutations).
 * 
 * @returns {Promise<Boolean>} returns true if pending updates found, false otherwise
 */
async function hasPendingUpdates () {
  let result = false;

  const requests = await queue?.getAll();
  if (requests) {
    for (const request of requests) {
      if (request.metadata?.op && request.metadata.op !== 'get') {
        result = true;
        break;
      }
    }
  }

  let db;
  if (!result) {
    db = await getDB();
  }

  if (!result) {
    const batchStore = makeStoreName(batchStoreType);
    const hasUpdates = await db.count(batchStore);
    result = hasUpdates > 0;
  }

  if (!result) {
    const conflictStore = makeStoreName(conflictStoreType);
    const hasConflicts = await db.count(conflictStore);
    result = hasConflicts > 0;
  }

  return result;
}

/**
 * Make a network request to the remote data service.
 *
 * @param {Request} request - The request object
 * @param {Object} [options] - options to handle data and control replay failure behavior
 * @param {AsyncFunction} [options.asyncResponseHandler] - data response handler
 * @param {AsyncFunction} [options.staleResponse] - stale response handler
 * @param {Object} [options.metadata] - metadata to be stored with the Request on replay
 * @param {Boolean} [options.retry] - true if failures should be queued for replay
 * @returns {Number} 0 on success or conflict resolution, E_REPLAY if queued for replay. Throws on error
 */
async function dataAPICall (request, {
  asyncResponseHandler = null,
  staleResponse = null,
  metadata = null,
  retry = true
} = {}) {
  debug('dataAPICall ', request.url, request.method);

  const abortController = new AbortController();
  let fetchTimer = setTimeout(
    abortController.abort.bind(abortController),
    fetchTimeout
  );

  let result = 0;
  let response = null;
  
  try {
    response = await fetch(request.clone(), {
      signal: abortController.signal
    });

    clearTimeout(fetchTimer);
    fetchTimer = null;

    if (response.ok) {
      if (typeof asyncResponseHandler === 'function') {
        const data = await response.json();
        await asyncResponseHandler(data);
      }
    } else {
      let handled = false;

      if (request.method !== 'GET') {
        const resp = await response.json();

        if (resp.versionError) {
          await versionConflict(metadata);
          handled = true;
          result = E_CONFLICT;
        }
      } else {
        if (staleResponse) {
          await staleResponse();
          handled = true;
        }
      }

      if (!handled) {
        throw new Error(`[${response.status}] ${request.method} ${request.url}`);
      }
    }
  } catch (error) {
    debug('dataAPICall failed', error.name, error.message);

    if (fetchTimer) {
      clearTimeout(fetchTimer);
    }

    let handled = false;

    if (request.method === 'GET' && staleResponse) {
      await staleResponse();
      handled = true;
    }

    if (canSync && retry && !response) {
      queue.pushRequest({
        request,
        metadata
      });
      handled = true;
      result = E_REPLAY;
    }

    if (!handled) {
      throw error;
    }
  }

  return result;
}

/**
 * Refresh the local store copy with remote data.
 * If there are outgoing pending updates, return local data instead.
 * If there is a network issue, return local data instead.
 *
 * @param {Object} payload - payload parameters
 * @param {String} payload.storeType - store:scope
 * @param {String} [payload.document] - document name
 * @param {String|Array<String>} [payload.collections] - collection name(s) to get
 */
export async function refreshData ({ storeType, document, collections }) {
  debug(`refreshData, ${storeType}:${document}`, collections);

  const hasUpdates = await hasPendingUpdates();
  if (hasUpdates) {
    return localData(storeType, document, collections);
  }

  const resource = makeStoreTypeURLFragment(storeType);
  const baseUrl = `/api/data/${resource}`;
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
    staleResponse: localData.bind(null, storeType, document, collections),
    metadata: {
      storeType,
      document,
      collections,
      op : 'get'
    }
  });
}

/**
 * Synchronize local data creation and updates with the remote data service.
 * 
 * @param {Object} payload - payload parameters
 * @param {String} payload.storeType - 'app' or 'user'
 * @param {String} payload.document - The document to which the update applies
 * @param {Array<String>} [payload.collections] - The collections to upsert, omit for all
 */
async function upsertData ({ storeType, document, collections = null }) {
  debug(`upsertData, ${storeType}:${document}`, collections);

  if (!storeType || !document) {
    throw new Error('Bad input passed to upsertData');
  }

  const resource = makeStoreTypeURLFragment(storeType);
  const baseUrl = `/api/data/${resource}`;
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

  const result = await dataAPICall(request, {
    asyncResponseHandler: async data => {
      await storeMutationResult(storeType, document, data);
      await clearBaseStoreRecords(storeType, document, 'put');
    },
    metadata: {
      storeType,
      document,
      collections,
      op: 'put'
    }
  });

  return result;
}

/**
 * Synchronize local data deletions with the remote data service.
 * Formats data for the delete api methods if input is String|Array<String>.
 * If input is Object|Array<Object> this assumes the data is already formatted properly.
 *   @see processBatchUpdates for formatting
 * 
 * @param {Object} payload - parameters
 * @param {String} payload.storeType - 'app' or 'user'
 * @param {String} payload.document - The document to which the delete applies
 * @param {String|Array<String>|Object|Array<Object>} [payload.collections] - Collection name(s), or Object(s) of { collection: 'name', properties: ['propName'...] }
 */
async function deleteData ({ storeType, document, collections }) {
  debug(`deleteData, ${storeType}:${document}`, collections);
  
  if (!storeType || !document) {
    throw new Error('Bad input passed to deleteData');
  }

  const resource = makeStoreTypeURLFragment(storeType);
  const baseUrl = `/api/data/${resource}`;
  let url = `${baseUrl}/${document}`;

  // Prepare string collections
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

  // Get version
  const db = await getDB();
  const versionStoreName = makeStoreName(versionStoreType);
  const { version } = await db.get(versionStoreName, [storeType, document]);

  // Prepare request body
  const body = { version };
  if (collections) {
    body.collections = collections;
  }

  const request = new Request(url, {
    method: 'DELETE',
    headers: {
      'X-Api-Version': apiVersion,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const result = await dataAPICall(request, {
    asyncResponseHandler: async data => {
      await storeMutationResult(storeType, document, data);
      await clearBaseStoreRecords(storeType, document, 'delete');
    },
    metadata: {
      storeType,
      document,
      collections,
      op: 'delete'
    }
  });

  return result;
}

/**
 * Clean the base document store after mutations.
 * 
 * @param {String} storeType - 'app' or 'user'
 * @param {String} document - The document that was updated
 * @param {String} op - 'put' or 'delete'
 */
async function clearBaseStoreRecords (storeType, document, op) {
  const baseStoreName = makeStoreName(baseStoreType);
  const db = await getDB();

  let count = 0;
  const documents = await db.transaction(baseStoreName, 'readwrite').store.index('document');
  for await (const cursor of documents.iterate([storeType, document, op])) {
    count++;
    await cursor.delete();
  }
  debug(`deleted ${count} base document records for ${storeType}:${document}`);
}

/**
 * Prepare for a data update by making a copy of the original type, document, and collection that might change to the base document store.
 * If it's already been copied, and not expired by policy, do nothing.
 * This copy is used in the case a conflict resolution is required, so we keep a per-op version of each, clearing the companion records
 * as each mutation op completes.
 * 
 * @param {Object} payload - The message payload object
 * @param {String} payload.storeType - store:scope
 * @param {String} payload.document - The document to be updated
 * @param {String} payload.op - The mutation operation, 'put' or 'delete'
 * @param {String} [payload.collection] - The collection to be updated
 * @param {Boolean} [clearOnly] - True to clear the record only, default false
 */
async function _mayUpdate ({ storeType, document, collection, op }, clearOnly = false) {
  if (!storeType || !document) {
    throw new Error('Bad input passed to mayUpdate');
  }
  
  /* eslint-disable no-param-reassign */
  collection = collection ?? '';
  /* eslint-enable no-param-reassign */

  const baseStoreName = makeStoreName(baseStoreType);
  const scope = getStoreTypeScope(storeType);
  const storeName = makeStoreName(storeType);
  const db = await getDB();

  if (collection) {
    const baseCopy = await db.getFromIndex(baseStoreName, 'collection', [storeType, document, collection, op]);
    const staleBase = baseCopy && (Date.now() - baseCopy.timestamp) >= STALE_BASE_LIFESPAN;

    if (!baseCopy || staleBase || clearOnly) {
      if ((staleBase || clearOnly) && baseCopy) {
        await db.delete(baseStoreName, baseCopy.id);
      }

      if (!clearOnly) {
        const original = await db.get(storeName, [scope, document, collection]);

        await db.add(baseStoreName, {
          storeType, document, collection, op, timestamp: Date.now(), properties: original.properties
        });
      }
    }
  } else {
    const documents = await db.transaction(baseStoreName, 'readwrite').store.index('document');
    const docCount = await documents.count([storeType, document, op]);
    let deleteCount = 0;

    for await (const cursor of documents.iterate([storeType, document, op])) {
      const item = cursor.value;
      const staleBase = Date.now() - item.timestamp >= STALE_BASE_LIFESPAN;

      if (staleBase || clearOnly) {
        deleteCount++;
        await cursor.delete();
      }
    }

    if ((docCount === 0 || docCount === deleteCount) && !clearOnly) {
      const original = await db.getAllFromIndex(storeName, 'document', [scope, document]);

      for (const orig of original) {
        await db.add(baseStoreName, {
          storeType,
          document,
          collection: orig.collection_name,
          op,
          timestamp: Date.now(),
          properties: orig.properties
        });
      }
    }
  }
}

/**
 * Call _mayUpdate in a serial execution lock.
 * 
 * @param {Object} payload - payload for _mayUpdate
 * @param {Boolean} clearOnly - clearOnly for _mayUpdate
 */
export async function mayUpdate (payload, clearOnly = false) {
  await criticalSection.execute(() => _mayUpdate(payload, clearOnly));
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
  const batchStoreName = makeStoreName(batchStoreType);
  const db = await getDB();
  const totalRecords = await db.count(batchStoreName);

  if (totalRecords === 0) {
    debug(`Batch process skipped, no records found in the ${batchStoreName}`);
    return;
  }

  const networkCallOrder = [];
  const output = {
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
  const batch = await db.transaction(batchStoreName).store.index('batch');
  // batch is sorted by key ['id', 'storeType', 'document', 'collection'] 

  // vvvv Complex code alert vvvv
  // Loop through batch records and build network calls.
  // This loop enforces additional constraints in the reverse id order sort.
  // (needed because we have asymmetry in allowing property level deletes, not just collection, but puts are always only collection level)
  // This complexity was introduced by requiring property consideration just for deletes.
  // 1. newer deletes always override older matching puts (older puts that match with newer deletes are discarded):
  //    - matching precedence: a. whole document, b. whole collection, c. single property
  //      - If any of these match, the older puts and deletes have to be discarded
  //    - In the case where older put does not overlap with a newer delete, both are executed
  // 2. older puts merge collection with newer matching puts, except whole document puts
  // 3. older deletes merge properties with newer matching deletes, except whole document or collection deletes
  // 4. presumes newer puts could not be made on deleted items

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
        networkCallOrder.unshift(item.op); // add to head so newest will be last
        output[item.op].unshift({
          storeType: item.storeType,
          document: item.document,
          collections: item.collection ? [item.collection] : [],
          properties
        });
      }
    }

    lastKey = key;
  }

  debug(`processBatchUpdates processing ${output.put.length} puts, ${output.delete.length} deletes...`, {
    ...output
  });
  debug('processBatchUpdates networkCallOrder', ...networkCallOrder);

  const reconcile = [];
  for (const op of networkCallOrder) { // replay oldest to newest
    const item = output[op].shift();
    const request = { ...item };
    let result;

    if (request.properties?.hasProps) {
      request.collections = request.collections.map(collection => ({
        collection,
        properties: request.properties.get(collection)
      }));
    }

    try {
      result = await network[op](request);

      debug(`processBatchUpdates '${network[op].name}' completed with '${result}' for '${op}' with '${request.storeType}:${request.document}'`, {
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
    const deleteRecords = await db.transaction(batchStoreName, 'readwrite').store.index('delete');
    let count = 0;
    for await (const cursor of deleteRecords.iterate([item.storeType, item.document, op])) {
      count++;
      await cursor.delete();
    }
    debug(`processBatchUpdates '${op}' processed ${count} records for '${item.storeType}:${item.document}'`);

    if (result === E_CONFLICT) {
      debug('processBatchUpdates prior invocation exiting on subsequent conflict resolution');
      break; // We were invoked in subsequent resolution
    }
  }

  // This happens if:
  //   Bad input format
  //   The remote data service errors in unanticpated way (probably bad input)
  //   A coding error (probably handling input)
  //   Incompatible browser without natural or artificial canSync
  //   (Network or Version conflicts are handled at a lower level)
  // The local copy is out of sync with the remote service, reconcile contains all the failed items
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
 * @param {String} [payload.propertyName] - The property name to delete, required for 'delete'
 * @param {Boolean} [skipTimer] - true to not schedule processing, caller must schedule. Defaults to false.
 */
export async function batchUpdate ({ storeType, document, op, collection, propertyName }, skipTimer = false) {
  if (!storeType || !document || !op) {
    throw new Error('Bad input passed to batchUpdate');
  }

  if (!skipTimer) {
    startTimer(batchCollectionWindow, 'batch-timer', processBatchUpdates);
  }

  /* eslint-disable no-param-reassign */
  collection = collection ?? '';
  propertyName = propertyName ?? '';
  /* eslint-enable no-param-reassign */

  debug(`batchUpdate db.add ${storeType}:${document}:${collection}:${propertyName}:${op}`);

  const db = await getDB();
  const batchStoreName = makeStoreName(batchStoreType);
  await db.add(batchStoreName, {
    storeType, document, collection, propertyName, op
  });
}

/**
 * Add a batch update record if a similar one doesn't exist.
 * Called on conflict resolution, no timer required.
 * 
 * @param {Object} payload - The message payload object
 * @param {String} payload.storeType - 'app' or 'user'
 * @param {String} payload.document - The document for these updates
 * @param {String} payload.op - 'put' or 'delete'
 * @param {String} [payload.collection] - The collection to update
 * @param {String} [payload.propertyName] - The property name to delete, required for 'delete'
 */
async function conditionalBatchUpdate ({ storeType, document, op, collection, propertyName }) {
  if (!storeType || !document || !op) {
    throw new Error('Bad input passed to conditionalBatchUpdate');
  }

  const db = await getDB();

  /* eslint-disable no-param-reassign */
  collection = collection ?? '';
  /* eslint-enable no-param-reassign */

  debug(`conditionalBatchUpdate ${storeType}:${document}:${collection}:${op}`);

  const batchStoreName = makeStoreName(batchStoreType);
  const batchRecordIndex = await db.transaction(batchStoreName).store.index('record');
  const count = await batchRecordIndex.count([
    storeType, document, collection, op
  ]);

  if (count === 0) {
    await batchUpdate({ storeType, document, op, collection, propertyName }, true);
  } else {
    debug('batchUpdate SKIPPED');
  }
}

/**
 * Perform a three way merge.
 * Conflict is resolved by always prefering local OVER remote changes/values.
 */
function threeWayMerge (base, remote, local) {
  if (!base) {
    return remote; // there were no local changes, so reuse the GET
  }

  const diffBaseRemote = jsonDiffPatch.diff(base, remote);
  const diffBaseLocal = jsonDiffPatch.diff(base, local);

  // Merge remote and local changes into the base
  let mergedObject = { ...base };

  if (diffBaseRemote && diffBaseLocal) {
    const diffs = Object.create(null);
    const patchedLocal = Object.create(null);

    const hasOwnProperty = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
    const getType = (obj, key) => Array.isArray(obj[key]) ? 'array' : typeof obj[key];
    const getValue = val => Array.isArray(val) ? val[val.length - 1] : val;
    const isNullish = val => val === undefined || val === null;

    // Patch in remote changes (adds, deletes) or save actual diffs
    for (const key of Object.keys(diffBaseRemote)) {
      if (hasOwnProperty(remote, key) && (hasOwnProperty(mergedObject, key) || typeof mergedObject[key] !== 'undefined')) {
        diffs[key] = {
          remote: diffBaseRemote[key],
          type: getType(mergedObject, key)
        };
      } else {
        debug(`3WayMerge: patching remote property change for ${key}`, diffBaseRemote[key]);
        jsonDiffPatch.patch(mergedObject, { [key]: diffBaseRemote[key] });
      }
    }

    // Patch in local changes (adds, deletes) or save actual diffs
    for (const key of Object.keys(diffBaseLocal)) {
      if (hasOwnProperty(local, key) && (hasOwnProperty(mergedObject, key) || typeof mergedObject[key] !== 'undefined')) {
        const diff = {
          local: diffBaseLocal[key],
          type: getType(mergedObject, key)
        };
        diffs[key] = hasOwnProperty(diffs, key) ? {
          ...diffs[key],
          ...diff
        } : diff;
      } else {
        debug(`3WayMerge: patching local property change for ${key}`, diffBaseLocal[key]);
        patchedLocal[key] = true;
        jsonDiffPatch.patch(mergedObject, { [key]: diffBaseLocal[key] });
      }
    }

    // Convert diff results to target javascript value types
    const diffToValue = (diff, targetType) => {
      let newValue;
      switch(targetType) {
        case 'array':
          newValue = Object.entries(diff).reduce((acc, [key, value]) => {
            if (Number.isInteger(parseInt(key, 10))) {
              acc.push(getValue(value));
            }
            return acc;
          }, []);
          break;
        default:
          newValue = getValue(diff);
          break;
      }
      return newValue;
    };
  
    // Handle diffs, always choose local over remote
    for (const path of Object.keys(diffs)) {
      const { remote, local, type } = diffs[path];

      if (!isNullish(local)) {
        debug(`3WayMerge: resolving conflict with local ${path}`, local, type);
        mergedObject[path] = diffToValue(local, type);
      } else if (!isNullish(remote) && !patchedLocal[path]) {
        debug(`3WayMerge: resolving conflict with remote ${path}`, remote, type);
        mergedObject[path] = diffToValue(remote, type);
      } else {
        debug(`3WayMerge: could NOT resolve diff for ${path}`);
      }
    }
  } else if (diffBaseRemote) {
    debug('3WayMerge: diffBaseRemote only');
    jsonDiffPatch.patch(mergedObject, diffBaseRemote);
  } else if (diffBaseLocal) {
    debug('3WayMerge: diffBaseLocal only');
    jsonDiffPatch.patch(mergedObject, diffBaseLocal);
  }

  return mergedObject;
}

/**
 * Read the versionConflict objectStore and process the version conflicts:
 * 
 * 1. Read the conflictStore for all the current version remote data saved with type, op, and collection info
 * 2. Build the remote data documents
 * 3. Build the corresponding local data documents
 * 4. Merge the local onto the remote
 * 5. Write the result back into the local data document store
 * 6. Update the versionStore with the new document version
 * 7. Schedule batch updates for the new data
 * 8. Notify the client of the new data documents
 * 9. Delete all the used conflictStore records
 * 
 */
async function processVersionConflicts () {
  const conflictStoreName = makeStoreName(conflictStoreType);
  const db = await getDB();
  const totalRecords = await db.count(conflictStoreName);

  if (totalRecords === 0) {
    debug(`Version conflicts process skipped, no records found in the ${conflictStoreName}`);
    return;
  }

  debug(`processVersionConflicts processing ${totalRecords} records from ${conflictStoreName}...`);

  const conflictDocs = await db.transaction(conflictStoreName).store.index('version');

  debug('conflictDocs version index records: ', await conflictDocs.count());

  // Read all conflict doc records, latest version first
  // Set aside doc version, batch & base commands, and build the remote document objects.
  const remoteData = {};
  const versions = {};
  const batch = {};
  const baseKeys = [];
  for await (const cursor of conflictDocs.iterate(null, 'prev')) { // latest version first
    const {
      new_version,
      storeType,
      document_name: doc,
      collection_name: col,
      properties: props,
      op,
      collections
    } = cursor.value;

    // eslint-disable-next-line compat/compat
    const version = typeof BigInt(42) === 'bigint' ? BigInt(new_version) : +new_version; 

    // Build base properties if they don't exist
    versions[storeType] = versions[storeType] ?? {};
    batch[storeType] = batch[storeType] ?? {};
    batch[storeType].put = batch[storeType].put ?? null;
    batch[storeType].delete = batch[storeType].delete ?? null;

    if (!versions[storeType][doc] || versions[storeType][doc] <= version) {
      versions[storeType][doc] = version;
      batch[storeType][op] = {
        storeType,
        document: doc,
        op,
        collections
      };
      baseKeys.push([storeType, doc, col, op]);

      remoteData[storeType] = remoteData[storeType] ?? {};
      remoteData[storeType][doc] = remoteData[storeType][doc] ?? {};
      remoteData[storeType][doc][col] = {
        ...props
      };
    }
  }

  debug('processVersionConflicts remoteData', remoteData);

  // Read the local counterparts of the remote data, assemble localData
  const localData = {};
  for (const storeType of Object.keys(remoteData)) {
    const storeName = makeStoreName(storeType);
    const scope = getStoreTypeScope(storeType);
    
    for (const doc of Object.keys(remoteData[storeType])) {
      const records = await db.getAllFromIndex(storeName, 'document', [scope, doc]);
      
      for (const rec of records) {
        localData[storeType] = localData[storeType] ?? {};
        localData[storeType][rec.document_name] =
          localData[storeType][rec.document_name] ?? {};
        localData[storeType][rec.document_name][rec.collection_name] = {
          ...rec.properties
        };
      }
    }
  }

  debug('processVersionConflicts localData', localData);

  // Read the base data being mutated, assemble baseData
  const baseStoreName = makeStoreName(baseStoreType);
  const baseData = {};
  for (const baseKey of baseKeys) {
    const baseDoc = await db.getFromIndex(baseStoreName, 'collection', baseKey);
    if (baseDoc) {
      const {
        storeType,
        document: doc,
        collection: col,
        properties: props
      } = baseDoc;

      baseData[storeType] = baseData[storeType] ?? {};
      baseData[storeType][doc] = baseData[storeType][doc] ?? {};
      baseData[storeType][doc][col] = { ...props };
    } else {
      debug(`baseDoc for ${baseKey} was not found`);
    }
  }

  debug('processVersionConflicts baseData', baseData);

  // Merge the localData onto the remoteData using baseData to assemble newData
  // localData and baseData are built from remoteData
  const newData = {};
  for (const storeType of Object.keys(localData)) {
    for (const doc of Object.keys(localData[storeType])) {
      for (const col of Object.keys(localData[storeType][doc])) {
        const newCol = threeWayMerge(
          baseData?.[storeType]?.[doc]?.[col],
          remoteData[storeType][doc][col],
          localData[storeType][doc][col]
        );

        newData[storeType] = newData[storeType] ?? {};
        newData[storeType][doc] = newData[storeType][doc] ?? {};
        newData[storeType][doc][col] = newCol;
      }
    }
  }

  debug('processVersionConflicts newData', newData);

  // Write the newData docs back to the local stores, collect notification message data
  const message = {};
  for (const storeType of Object.keys(newData)) {
    const storeName = makeStoreName(storeType);
    const scope = getStoreTypeScope(storeType);

    message[storeType] = message[storeType] ?? { keys: [] };
    message[storeType].dbname = dbname;
    message[storeType].storeName = storeName;
    message[storeType].storeType = storeType;
    message[storeType].scope = scope;

    for (const [doc_name, doc] of Object.entries(newData[storeType])) {
      for (const [col_name, props] of Object.entries(doc)) {
        message[storeType].keys.push([doc_name, col_name]);

        await db.put(storeName, {
          scope,
          document_name: doc_name,
          collection_name: col_name,
          properties: props
        });
      }
    }
  }

  debug(`processVersionConflicts wrote ${message.app?.keys.length} app records and ${message.user?.keys.length} user records`);

  // Update the version objectStore with the new versions for the docs
  const versionStoreName = makeStoreName(versionStoreType);
  for (const storeType of Object.keys(versions)) {
    for (const [document, version] of Object.entries(versions[storeType])) {
      if (document && version > 0) {
        await db.put(versionStoreName, {
          storeType,
          document,
          version: `${version}`
        });
      }
    }
  }

  debug('processVersionConflicts updated version store', versions);

  const isObj = thing => Object.prototype.toString.call(thing) === '[object Object]';

  // Queue the batch commands, if required
  for (const storeType of Object.keys(batch)) {
    for (const [, payload] of Object.entries(batch[storeType])) {
      if (!payload) break;

      if (Array.isArray(payload.collections) && payload.collections.length > 0) {
        if (payload.collections.every(i => typeof i === 'string')) {
          for (const collection of payload.collections) {
            debug('Scheduling batch update: ', { ...payload, collection });
            await conditionalBatchUpdate({ ...payload, collection });
          }
        } else if (payload.collections.every(i => isObj(i))) {
          const params = [];

          for (const obj of payload.collections) {
            if (Array.isArray(obj.properties) && obj.properties.length > 0) {
              for (const prop of obj.properties) {
                params.push({
                  ...payload,
                  collection: obj.collection,
                  propertyName: prop
                });
              }
            } else {
              params.push({
                ...payload,
                collection: obj.collection
              });
            }
          }

          for (const param of params) {
            debug('Scheduling batch update: ', param);
            await conditionalBatchUpdate(param);
          }
        }
      } else {
        debug('Scheduling batch update: ', payload);
        await conditionalBatchUpdate(payload); // storeType, document, op for a doc update
      }
    }
  }

  // Delete all the conflict records for the processed document
  let conflictDeletes = 0;
  for (const storeType of Object.keys(remoteData)) {
    for (const [doc_name, doc] of Object.entries(remoteData[storeType])) {
      for (const [col_name,] of Object.entries(doc)) {
        conflictDeletes++;
        await db.delete(conflictStoreName, [storeType, doc_name, col_name]);
      }
    }
  }

  debug(`deleted ${conflictDeletes} conflict records before re-processing`);

  await processBatchUpdates();

  // Notify the app the data was updated
  for (const [, payload] of Object.entries(message)) {
    await sendMessage('database-data-update', {
      ...payload,
      message: {
        text: 'The data was synchronized with the latest version',
        class: 'info'
      }
    });
  }

  debug('processVersionConflicts sent client messages', message);
}

/**
 * Store the version conflict resolution data to the objectStore.
 * Contains the current version and data for the document to be updated from the remote store,
 * along with the requested modication data of storeType, op (the modification), and the collections array.
 * 
 * @param {String} storeType - 'app' or 'user'
 * @param {String} op - 'put' or 'delete'
 * @param {Array<String>|Array<Object>|String} collections - The network request collections
 * @param {Object} data - The latest version of the remote document
 */
async function storeVersionConflict (storeType, op, collections, data) {
  const db = await getDB();
  const conflictStoreName = makeStoreName(conflictStoreType);

  // Format and store the new version data
  for (const [doc_name, doc] of Object.entries(data)) {
    const newDocVersion = doc.__version;
    delete doc.__version;

    // Make a sortable BigInt version string, 15 digits max left pad 0
    const new_version = newDocVersion.padStart(15, '0');

    for (const [col_name, props] of Object.entries(doc)) {
      await db.put(conflictStoreName, {
        storeType,
        document_name: doc_name,
        collection_name: col_name,
        properties: props,
        new_version,
        op,
        collections
      });
    }
  }
}

/**
 * Resolve a version conflict.
 * Gets the remote document and starts the resolution process.
 * 
 * @param {Object} payload - The parameters
 * @param {String} payload.storeType - 'user' or 'app'
 * @param {String} payload.document - The document name
 * @param {String} payload.op - 'put' or 'delete'
 * @param {String|Array<String>|Array<Object>} payload.collections - The network request format of collections
 */
async function versionConflict ({ storeType, document, op, collections }) {
  const resource = makeStoreTypeURLFragment(storeType);
  const url = `/api/data/${resource}/${document}`;

  const result = await dataAPICall(new Request(url, {
    headers: {
      'X-Api-Version': apiVersion,
      'Content-Type': 'application/json'
    }
  }), {
    asyncResponseHandler: async data => {
      await storeVersionConflict(storeType, op, collections, data);
    },
    metadata: {
      storeType,
      op,
      collections
    }
  });

  if (result !== E_REPLAY) {
    await processVersionConflicts();
  }
}

/**
 * The service worker install lifecycle handler.
 */
export async function installDatabase () {
  /* eslint-disable no-unused-vars */
  db = await openDB(dbname, schemaVersion, {
    upgrade(db, oldVersion, newVersion, transaction, event) {

      //
      // MAIN STORES (app, user)
      // upgrade main objectStores...
      for (const storeType of mainStoreTypes) {
        const storeName = makeStoreName(storeType);
        
        if (!db.objectStoreNames.contains(storeName)) {
          const store = db.createObjectStore(storeName, {
            keyPath: ['scope', 'document_name', 'collection_name']
          });
          store.createIndex('document', ['scope', 'document_name'], {
            unique: false
          });
          store.createIndex('collection', ['scope', 'collection_name'], {
            unique: false
          });
        }
    
        // Do future migrations of storeType objectStores here...

        // Cleanup all old objectStores after migration
        // deleteObjectStore can only be called in a version event transaction (like here).
        for (let oldVersion = schemaVersion - 1; oldVersion > -1; oldVersion--) {
          const oldStoreName = makeStoreName(storeType, oldVersion);
          if (db.objectStoreNames.contains(oldStoreName)) {
            db.deleteObjectStore(oldStoreName);
          }
        }
      }

      //
      // VERSION STORE
      // Upgrade version objectStore...
      const versionStoreName = makeStoreName(versionStoreType);
      if (!db.objectStoreNames.contains(versionStoreName)) {
        db.createObjectStore(versionStoreName, {
          keyPath: ['storeType', 'document']
        });
      }

      // Do future migrations of version objectStore here...

      // Cleanup all old objectStores after migration
      // deleteObjectStore can only be called in a version event transaction (like here).
      for (let oldVersion = schemaVersion - 1; oldVersion > -1; oldVersion--) {
        const oldStoreName = makeStoreName(versionStoreType, oldVersion);
        if (db.objectStoreNames.contains(oldStoreName)) {
          db.deleteObjectStore(oldStoreName);
        }
      }

      //
      // CONFLICT STORE
      // Upgrade conflict objectStore...
      const conflictStoreName = makeStoreName(conflictStoreType);
      if (!db.objectStoreNames.contains(conflictStoreName)) {
        const store = db.createObjectStore(conflictStoreName, {
          keyPath: ['storeType', 'document_name', 'collection_name']
        });
        store.createIndex('version', ['new_version', 'storeType', 'document_name', 'op'], {
          unique: false
        });
      }

      // Do future migrations of version objectStore here...

      // Cleanup all old objectStores after migration
      // deleteObjectStore can only be called in a version event transaction (like here).
      for (let oldVersion = schemaVersion - 1; oldVersion > -1; oldVersion--) {
        const oldStoreName = makeStoreName(conflictStoreType, oldVersion);
        if (db.objectStoreNames.contains(oldStoreName)) {
          db.deleteObjectStore(oldStoreName);
        }
      }

      //
      // BATCH STORE
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
        store.createIndex('record', ['storeType', 'document', 'collection', 'op'], {
          unique: false
        });
      }

      // Do future migrations of batchUpdate objectStore here...

      // Cleanup all old objectStores after migration
      // deleteObjectStore can only be called in a version event transaction (like here).
      for (let oldVersion = schemaVersion - 1; oldVersion > -1; oldVersion--) {
        const oldStoreName = makeStoreName(batchStoreType, oldVersion);
        if (db.objectStoreNames.contains(oldStoreName)) {
          db.deleteObjectStore(oldStoreName);
        }
      }

      //
      // BASE STORE
      // Upgrade the base document objectStore...
      const baseStoreName = makeStoreName(baseStoreType);
      if (!db.objectStoreNames.contains(baseStoreName)) {
        const store = db.createObjectStore(baseStoreName, {
          keyPath: 'id',
          autoIncrement: true
        });
        store.createIndex('collection', ['storeType', 'document', 'collection', 'op'], {
          unique: true
        });
        store.createIndex('document', ['storeType', 'document', 'op'], {
          unique: false
        });
      }

      // Do future migrations of base objectStore here...

      // Cleanup all old objectStores after migration
      // deleteObjectStore can only be called in a version event transaction (like here).
      for (let oldVersion = schemaVersion - 1; oldVersion > -1; oldVersion--) {
        const oldStoreName = makeStoreName(baseStoreType, oldVersion);
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
  
  await refreshData({ storeType: 'app:public' });
}