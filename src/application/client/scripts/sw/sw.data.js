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
import { createMerger } from 'smob';
import { openDB } from 'idb';
import { Queue } from 'workbox-background-sync'; // workbox-core
import { _private } from 'workbox-core';
import { startTimer } from './sw.timer.js';

const dbname = 'jam_build';
const storeTypes = ['app', 'user'];
const batchStoreType = 'batch';
const versionStoreType = 'version';
const conflictStoreType = 'conflict';
const schemaVersion = SCHEMA_VERSION; // eslint-disable-line -- assigned at bundle time
const apiVersion = API_VERSION; // eslint-disable-line -- assigned at bundle time
const queueName = `${dbname}-requests-${apiVersion}`;
const { debug } = _private.logger || { debug: ()=> {} };
const batchCollectionWindow = process?.env?.NODE_ENV !== 'production' ? 3000 : 3000; // eslint-disable-line -- assigned at bundle time
const E_REPLAY = 0xf56f3634aca0;

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

  if (canSync && !syncSupport && queue) {
    replayQueueRequestsWithDataAPI({ queue }); // replay now if no sync
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
      if (entry.metadata) {
        if (entry.request.method === 'GET') {
          asyncResponseHandler = async data => {
            const { storeType, op, collections } = entry.metadata;
            if (op) {
              return storeVersionConflict(storeType, op, collections, data);
            }
            await storeData(storeType, data);
          };
        } else { // POST, DELETE
          asyncResponseHandler = async data => {
            const { storeType, document } = entry.metadata;
            await storeMutationResult(storeType, document, data);
          };
        }
      }
      await dataAPICall(entry.request, {
        asyncResponseHandler,
        metadata: entry.metadata,
        retry: false
      });
    } catch {
      debug('Failed to replay request: ', entry.request.url);
      await queue.unshiftRequest(entry);
      throw new _private.WorkboxError('queue-replay-failed', {name: queueName});
    }
  }

  await processVersionConflicts();

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
    let clients = await self.clients.matchAll();

    if (clients.length === 0) {
      await self.clients.claim();
      clients = await self.clients.matchAll();
    }

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
 * Store put or delete successful mutation new version result.
 * 
 * @param {String} storeType - 'app' or 'user'
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
 * Send data message to the app for the (stale) localData.
 * 
 * @param {String} storeType - 'app' or 'user'
 * @param {String} document - The document name
 * @param {String|Array<String>} [collections] - collection name(s) to get
 * @param {String} [message] - A user message
 */
async function localData (storeType, document, collections = null, message = '') {
  const storeName = makeStoreName(storeType);
  const db = await getDB();
  const keys = [];

  if (collections) {
    const colls = typeof collections === 'string' ? [collections] : collections;
    for (const collection of colls) {
      keys.push([document, collection]);
    }
  } else {
    const idbResults = await db.getAllFromIndex(storeName, 'document', document);
    for (const idbResult of idbResults) {
      keys.push([document, idbResult.collection_name]);
    }
  }

  await sendMessage('database-data-update', {
    dbname,
    storeName,
    storeType,
    keys,
    local: true,
    message: {
      text: message,
      class: 'info'
    }
  });
}

/**
 * Store data in the jam_build database.
 * Re-formats data from the network to the idb objectStore format.
 * Sends message to the app for new data.
 *
 * @param {String} storeType - 'app' or 'user'
 * @param {Object} data - The remote data to store
 */
async function storeData (storeType, data) {
  const storeName = makeStoreName(storeType);
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
 * Load data from local objectStores by document name or document and possible collection name(s).
 * Format them for upsert to the remote data service.
 *
 * @param {String} storeType - 'app' or 'user'
 * @param {String} document - The document name
 * @param {Array<String>} [collections] - An array of collection names
 */
async function loadData (storeType, document, collections = null) {
  const result = { collections: [] };
  const storeName = makeStoreName(storeType);
  const versionStoreName = makeStoreName(versionStoreType);
  const db = await getDB();

  const { version } = await db.get(versionStoreName, [storeType, document]);
  result.version = version;

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
 * Make a network request to the remote data service.
 *
 * @param {Request} request - The request object
 * @param {Object} [options] - options to handle data and control replay failure behavior
 * @param {AsyncFunction} [options.asyncResponseHandler] - data response handler
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
  debug('dataAPICall ', request.url);

  let result = 0;
  let response = null;

  try {
    response = await fetch(request.clone());

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
        }
      } else {
        if (staleResponse) {
          await staleResponse('A local copy of the data is being shown');
          handled = true;
        }
      }

      if (!handled) {
        throw new Error(`[${response.status}] ${request.method} ${request.url}`);
      }
    }
  } catch (error) {
    debug('dataAPICall failed', error.message);

    let handled = false;

    if (request.method === 'GET' && staleResponse) {
      await staleResponse('A local copy of the data is being shown');
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
    staleResponse: localData.bind(null, storeType, document, collections),
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

  await dataAPICall(request, {
    asyncResponseHandler: async data => {
      await storeMutationResult(storeType, document, data);
    },
    metadata: {
      storeType,
      document,
      collections,
      op: 'put'
    }
  });
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
export async function deleteData ({ storeType, document, collections }) {
  debug(`deleteData, ${storeType}:${document}`, collections);
  
  if (!storeType || !document) {
    throw new Error('Bad input passed to deleteData');
  }

  const baseUrl = `/api/data/${storeType}`;
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

  await dataAPICall(request, {
    asyncResponseHandler: async data => {
      await storeMutationResult(storeType, document, data);
    },
    metadata: {
      storeType,
      document,
      collections,
      op: 'delete'
    }
  });
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
        output[item.op].unshift({ // add to head so newest will be last
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

  const db = await getDB();
  await db.add(makeStoreName(batchStoreType), {
    storeType, document, collection, propertyName, op
  });
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
  const storeName = makeStoreName(conflictStoreType);
  const db = await getDB();
  const totalRecords = await db.count(storeName);

  if (totalRecords === 0) {
    debug(`Version conflicts process skipped, no records found in the ${storeName}`);
    return;
  }

  debug(`processVersionConflicts processing ${totalRecords} records from ${storeName}...`);

  const conflictDocs = await db.transaction(storeName).store.index('version');

  debug('conflictDocs version index records: ', await conflictDocs.count());

  // Read all conflict doc records, latest version first
  // Set aside doc version, batch commands, and build the remote document objects.
  const remoteData = {};
  const versions = { app: {}, user: {} };
  const batch = { app: { put: null, delete: null }, user: { put: null, delete: null } };
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

    if (!versions[storeType][doc] || versions[storeType][doc] <= version) {
      versions[storeType][doc] = version;
      batch[storeType][op] = {
        storeType,
        document: doc,
        op,
        collections
      };
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
    
    for (const doc of Object.keys(remoteData[storeType])) {
      const records = await db.getAllFromIndex(storeName, 'document', doc);
      
      for (const rec of records) {
        localData[storeType] = localData[storeType] ?? {};
        localData[storeType][rec.document_name] =
          localData[storeType][rec.document_name] ?? {};
        localData[storeType][rec.document_name][rec.collection_name] =
          localData[storeType][rec.document_name][rec.collection_name] ?? {
            ...rec.properties
          };
      }
    }
  }

  debug('processVersionConflicts localData', localData);

  // Merge the localData onto the remoteData to create newData
  const merge = createMerger({
    inplace: true,
    priority: 'right',
    arrayPriority: 'right'
  });
  const newData = merge(remoteData, localData);

  debug('processVersionConflicts newData', newData);

  // Write the newData docs back to the local stores, collect notification message data
  const message = {};
  for (const storeType of Object.keys(newData)) {
    const storeName = makeStoreName(storeType);

    message[storeType] = message[storeType] ?? { keys: [] };
    message[storeType].dbname = dbname;
    message[storeType].storeName = storeName;
    message[storeType].storeType = storeType;

    for (const [doc_name, doc] of Object.entries(newData[storeType])) {
      for (const [col_name, props] of Object.entries(doc)) {
        message[storeType].keys.push([doc_name, col_name]);

        await db.put(storeName, {
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
      await db.put(versionStoreName, {
        storeType,
        document,
        version: `${version}`
      });
    }
  }

  debug('processVersionConflicts updated version store', versions);

  const isObj = thing => Object.prototype.toString.call(thing) === '[object Object]';

  // Queue the batch commands
  for (const storeType of Object.keys(batch)) {
    for (const [, payload] of Object.entries(batch[storeType])) {
      if (!payload) break;

      if (Array.isArray(payload.collections) && payload.collections.length > 0) {
        if (payload.collections.every(i => typeof i === 'string')) {
          for (const collection of payload.collections) {
            batchUpdate({ ...payload, collection });
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
            batchUpdate(param);
          }
        }
      } else {
        batchUpdate(payload); // storeType, document, op for a doc update
      }
    }
  }

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

  // Delete all the conflict records for the processed document
  for (const storeType of Object.keys(remoteData)) {
    for (const [doc_name, doc] of Object.entries(remoteData[storeType])) {
      for (const [col_name,] of Object.entries(doc)) {
        await db.delete(storeName, [storeType, doc_name, col_name]);
      }
    }
  }
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
  const storeName = makeStoreName(conflictStoreType);

  // Format and store the new version data
  for (const [doc_name, doc] of Object.entries(data)) {
    const newDocVersion = doc.__version;
    delete doc.__version;

    // Make a sortable BigInt version string, 15 digits max left pad 0
    const new_version = newDocVersion.padStart(15, '0');

    for (const [col_name, props] of Object.entries(doc)) {
      await db.put(storeName, {
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
  const url = `/api/data/${storeType}/${document}`;

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
    processVersionConflicts();
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
      // APP|USER STORES
      // upgrade main objectStores...
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
        let oldStoreName = makeStoreName(versionStoreType, oldVersion);
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
        let oldStoreName = makeStoreName(conflictStoreType, oldVersion);
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