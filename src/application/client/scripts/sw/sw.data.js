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
 *   setupBackgroundRequests - Setup offline request queue, 'sync' event or polyfill
 *   logout - Perform any logout actions
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
import { Queue } from 'workbox-background-sync'; // workbox-core
import { _private } from 'workbox-core';
import { getStoreTypeStore, getStoreTypeScope } from '#client-utils/storeType.js';
import { isObj } from '#client-utils/javascript.js';
import { startTimer, serviceAllTimers } from './sw.timer.js';
import { sendMessage, CriticalSection, debug } from './sw.utils.js';
import {
  apiVersion,
  batchCollectionWindow,
  batchStoreType,
  E_REPLAY,
  E_CONFLICT,
  fetchTimeout,
  queueName,
  versionStoreType
} from './sw.data.constants.js';
import {
  activateDatabase as _activateDatabase,
  getDB,
  makeStoreName
} from './sw.data.source.js';
export { installDatabase } from './sw.data.source.js';
import {
  clearBaseStoreRecords,
  hasPendingUpdates,
  loadData,
  localData,
  mayUpdate,
  storeData,
  storeMutationResult,
  storeVersionConflict
} from './sw.data.helpers.js';
export { mayUpdate } from './sw.data.helpers.js';
import { processVersionConflicts } from './sw.data.conflicts.js';

const csBatchUpdate = new CriticalSection();

/**
 * Export the service worker activate lifecycle handler
 */
export async function activateDatabase () {
  await _activateDatabase(refreshData);
}

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
        onSync: replayRequestQueue
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
    replayRequestQueue({ queue }); // replay now if artificial sync support
  }
}

/**
 * Substitute for stock workbox Queue.replayRequests.
 * Synchonrizes local/remote data, sends notifications to the app.
 * Processes any left over versionConflicts and batchUpdates.
 */
async function replayRequestQueue ({ queue }) {
  debug('Replaying queue requests...', queue);

  if (!queue) {
    throw new _private.WorkboxError('queue-replay-failed', {name: queueName});
  }

  const getRequests = [];
  const getConflicts = [];

  const getResponseHandler = async (metadata, data) => {
    const { storeType, op, collections } = metadata;
    if (op === 'put' || op === 'delete') {
      return storeVersionConflict(storeType, op, collections, data);
    }
    await storeData(storeType, data);
  };

  // Batch mutation requests in fifo order, defer GETs
  let entry;
  while ((entry = await queue.shiftRequest())) {
    const meta = entry.metadata;
    const method = entry.request.method;

    if (method === 'GET') {
      const queue = meta.op === 'get' ? getRequests : getConflicts;
      queue.push(entry);
    } else {
      const { storeType, document, collections, op } = meta;
  
      if (Array.isArray(collections) && collections.length > 0) {
        for (const coll of collections) {
          if (isObj(coll)) {
            const { collection, properties } = coll;
            await mayUpdate({ storeType, document, collection });
            if (Array.isArray(properties) && properties.length > 0) {
              for (const propertyName of properties) {
                await conditionalBatchUpdate({ storeType, document, op, collection, propertyName });
              }
            } else { // obj, no properties
              await conditionalBatchUpdate({ storeType, document, op, collection });
            }
          } else { // coll as string
            await mayUpdate({ storeType, document, collection: coll });
            await conditionalBatchUpdate({ storeType, document, op, collection: coll });
          }
        } // for - meta.collections
      } else { // take collections as a value
        await mayUpdate({ storeType, document, collection: collections });
        await conditionalBatchUpdate({ storeType, document, collection: collections });
      }
    } // else - mutations
  } // while - mutations

  // Store any incomplete version conflict GETs for prior mutations
  for (const conflict of getConflicts) {
    const meta = conflict.metadata;
    const { storeType, document, collection } = meta;
    await mayUpdate({ storeType, document, collection });
    await dataAPICall(entry.request, {
      asyncResponseHandler: getResponseHandler.bind(null, meta),
      metadata: meta,
      retry: false
    }); // TODO: service repeat failures
  } // for - conflict GETs

  // Process any/all left over conflicts into the batch queue, run batch
  await processVersionConflicts({
    processBatchUpdates, addToBatch: conditionalBatchUpdate
  });

  // Service ordinary GET requests, discard repeats
  let reqKey;
  const completed = {};
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

      throw new _private.WorkboxError('queue-replay-failed', {name: queueName});
    }
  } // for - get requests
}

/**
 * Export a way to force the queue to replay.
 */
export async function __forceReplay () {
  await replayRequestQueue({ queue });
}

/**
 * Make the url fragement to the resource for the given storeType.
 * For now, just get the storeType store.
 * When multiple app level data scopes required, use scope for 'app' store.
 * 
 * @param {String} storeType - store:scope path to document
 * @returns {String} The storeType resource
 */
function makeStoreTypeURLFragment (storeType) {
  const store = getStoreTypeStore(storeType);
  return store;
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

  let result = -1;
  let response = null;
  
  try {
    response = await fetch(request.clone(), {
      signal: abortController.signal
    });

    clearTimeout(fetchTimer);
    fetchTimer = null;

    debug(`fetch ${request.method} response for ${request.url}: ${response.status}`, response);

    if (response.ok) {
      if (typeof asyncResponseHandler === 'function') {
        let data = {};
        if (response.status !== 204) {
          data = await response.json();
        }
        await asyncResponseHandler(data);
      }
      result = 0;
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
    debug('dataAPICall threw exception', error.name, error.message);

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
 * @param {String} payload.storeType - store:scope path to document
 * @param {String} [payload.document] - document name
 * @param {String|Array<String>} [payload.collections] - collection name(s) to get
 */
export async function refreshData ({ storeType, document, collections }) {
  debug(`refreshData, ${storeType}:${document}`, collections);

  const hasUpdates = await hasPendingUpdates(queue);
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
 * @param {String} payload.storeType - store:scope path to document
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
      await clearBaseStoreRecords(storeType, document);
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
 * @param {String} payload.storeType - store:scope path to document
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
      await clearBaseStoreRecords(storeType, document);
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
 * Perform database actions on logout.
 * 
 * @param {String} storeType - store:scope path to document
 * @param {Boolean} [cleanup] - false to skip cleanup, defaults to true
 * @param {Boolean} [notify] - false to skip sendMessage, defaults to true
 */
async function logoutData (storeType, cleanup = true, notify = true) {
  if (cleanup) {
    const db = await getDB();
    const storeName = makeStoreName(storeType);
    const scope = getStoreTypeScope(storeType);
    const scopeIndex = await db.transaction(storeName, 'readwrite').store.index('scope');

    let count = 0;
    for await (const cursor of scopeIndex.iterate(IDBKeyRange.only(scope))) {
      count++;
      await cursor.delete();
    }

    debug(`Deleted ${count} records from ${storeName} on logout for scope ${scope}`);
  }

  if (notify) {
    await sendMessage('logout-complete');
  }
}

/**
 * Perform actions on logout.
 * 
 * @param {Object} payload - The arguments
 * @param {String} payload.storeType - store:scope path to document
 */
export async function logout ({ storeType }) {
  const hasUpdates = await hasPendingUpdates(queue);

  if (hasUpdates) {
    const db = await getDB();
    const batchStore = makeStoreName(batchStoreType);
    const batchOpsIndex = db.transaction(batchStore).store.index('ops');

    let exists = false;
    for await (const cursor of batchOpsIndex.iterate(IDBKeyRange.only('logout'))) {
      const { storeType: existingStoreType } = cursor.value;
      if (existingStoreType === storeType) {
        exists = true;
        break;
      }
    }

    if (!exists) {
      await batchUpdate({ storeType, op: 'logout' }, true);
      serviceAllTimers();
    }
  } else {
    await logoutData(storeType);
  }
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
  const networkOps = Object.keys(output);
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

    // only consider network ops
    if (!networkOps.includes(item.op)) continue;

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
  } // for - batchRecords

  debug(`processBatchUpdates processing ${output.put.length} puts, ${output.delete.length} deletes...`, {
    ...output
  });
  debug('processBatchUpdates networkCallOrder', ...networkCallOrder);

  let networkResult = 0;
  let storeTypeReplay = new Map();

  const reconcile = [];
  for (const op of networkCallOrder) { // replay oldest to newest
    const item = output[op].shift();
    const request = { ...item };

    if (request.properties?.hasProps) {
      request.collections = request.collections.map(collection => ({
        collection,
        properties: request.properties.get(collection)
      }));
    }

    try {
      networkResult = await network[op](request);

      storeTypeReplay.set(request.storeType, networkResult === E_REPLAY);

      debug(`processBatchUpdates '${network[op].name}' completed with '${networkResult}' for '${op}' with '${request.storeType}:${request.document}'`, {
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

    if (networkResult === E_CONFLICT) {
      debug('processBatchUpdates prior invocation exiting on subsequent conflict resolution');
      break; // We were invoked in subsequent resolution
    }
  } // for - networkCallOrder

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
  } // for - reconcile

  // If complete invocation, process any additional batch ops
  if (networkResult !== E_CONFLICT) {
    const batchOpsIndex = await db.transaction(batchStoreName, 'readwrite').store.index('ops');
    // op === 'logout'
    for await (const cursor of batchOpsIndex.iterate(IDBKeyRange.only('logout'))) {
      const { storeType } = cursor.value;
      await cursor.delete(); // always consume it
      const next = await cursor.continue(); // manual advance to check for last

      // If storeType mutation will replay, cleanup == false; If last storeType, notify == true
      logoutData(storeType, !storeTypeReplay.get(storeType), !next);
    }
  }
}

/**
 * Queue a mutation record for batch processing.
 * Reset the batchCollectionWindow.
 * 
 * @param {Object} payload - The message payload object
 * @param {String} payload.storeType - store:scope document path
 * @param {String} payload.op - 'put' or 'delete' or 'logout'
 * @param {String} [payload.document] - The document for these updates, can be omitted if op NOT 'put' or 'delete'
 * @param {String} [payload.collection] - The collection to update
 * @param {String} [payload.propertyName] - The property name to delete, required for 'delete'
 * @param {Boolean} [skipTimer] - true to not schedule processing, caller must schedule. Defaults to false.
 */
async function _batchUpdate ({ storeType, document, op, collection, propertyName }, skipTimer = false) {
  if (!storeType || !op || !(document || op === 'logout')) {
    throw new Error('Bad input passed to batchUpdate');
  }

  if (!skipTimer) {
    startTimer(batchCollectionWindow, 'batch-timer', processBatchUpdates);
  }

  /* eslint-disable no-param-reassign */
  collection = collection ?? '';
  propertyName = propertyName ?? '';
  document = document ?? '';
  /* eslint-enable no-param-reassign */

  debug(`_batchUpdate db.add ${storeType}:${document}:${collection}:${propertyName}:${op}`);

  const db = await getDB();
  const batchStoreName = makeStoreName(batchStoreType);
  await db.add(batchStoreName, {
    storeType, document, collection, propertyName, op
  });
}

/**
 * Call _batchUpdate in a serial execution lock to force complete, serial fcfs execution.
 * 
 * @param {Array} args - args for _batchUpdate
 */
export async function batchUpdate (...args) {
  await csBatchUpdate.execute(() => _batchUpdate(...args));
}

/**
 * Add a batch update record if a similar one doesn't exist.
 * Called on conflict resolution, no timer required.
 * 
 * @param {Object} payload - The message payload object
 * @param {String} payload.storeType - store:scope document path
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
  propertyName = propertyName ?? '';
  /* eslint-enable no-param-reassign */

  debug(`conditionalBatchUpdate ${storeType}:${document}:${collection}:${op}`);

  const batchStoreName = makeStoreName(batchStoreType);
  const batchRecordIndex = await db.transaction(batchStoreName).store.index('record');
  const count = await batchRecordIndex.count([
    storeType, document, collection, propertyName, op
  ]);

  if (count === 0) {
    await batchUpdate({ storeType, document, op, collection, propertyName }, true);
  } else {
    debug('batchUpdate SKIPPED');
  }
}

/**
 * Resolve a version conflict.
 * Gets the remote document and starts the resolution process.
 * 
 * @param {Object} payload - The parameters
 * @param {String} payload.storeType - store:scope path to document
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
    await processVersionConflicts({
      processBatchUpdates,
      addToBatch: conditionalBatchUpdate
    });
  }
}
