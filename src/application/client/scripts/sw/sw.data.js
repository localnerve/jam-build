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
import { openDB } from 'idb';
import { Queue } from 'workbox-background-sync'; // workbox-core
import { _private } from 'workbox-core';

const dbname = 'jam_build';
const storeTypes = ['app', 'user'];
const schemaVersion = SCHEMA_VERSION; // eslint-disable-line -- assigned at bundle time
const apiVersion = API_VERSION; // eslint-disable-line -- assigned at bundle time
const queueName = `${dbname}-requests-${apiVersion.replace('.', '-')}`;

let blocked = false;
let db;

let canSync = 'sync' in self.registration;
let queue;
try {
  queue = new Queue(queueName, {
    forceSyncFallback: !canSync,
    maxRetentionTime: 60 * 72, // 72 hours
    onSync: replayQueueRequestsWithDataAPI.bind(queue)
  });
  canSync = true;
} catch (e) {
  // eslint-disable-next-line
  console.debug(`Couldn't create Workbox Background Sync Queue ${e.name}`);
  canSync = false;
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
 * @param {Any} payload - The message payload
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
 * @param {Object} [options] - data handler, metadata to pass to retryHandler, retry flag to prevent reuse in retryHandler
 */
async function dataAPICall (request, {
  asyncResponseHandler = null,
  metadata = null,
  retry = true
} = {}) {
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
 * Substitute for stock Queue.replayRequests.
 * Used while bound to this modules Queue instance (this).
 * Stores data for GETs and sends update notifications to the app.
 */
async function replayQueueRequestsWithDataAPI () {
  let asyncResponseHandler = null;
  let entry;
  while ((entry = await this.shiftRequest())) {
    try {
      if (entry.request.method === 'GET' && entry.metadata) {
        asyncResponseHandler = async data => {
          await storeData(entry.metadata.storeType, data);
        };
      }
      await dataAPICall(entry.request.clone(), {
        asyncResponseHandler,
        retry: false
      });
    } catch {
      await this.unshiftRequest(entry);
      throw new _private.WorkboxError('queue-replay-failed', {name: this._name});
    }
  }
}

/**
 * Store data in the jam_build database.
 * 
 * @param {String} storeType - 'app' or 'user'
 * @param {Object} data - The remote data to store
 */
async function storeData (storeType, data) {
  const storeName = makeStoreName(storeType);
  const keys = [];

  // format and store the data
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

  await sendMessage('database-data-update', {
    storeName,
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
 * @param {String} [collection] - collection name (collection is the smallest GET, no indiv props)
 */
export async function refreshData (storeType, document, collection) {
  const baseUrl = `/api/data/${storeType}`;
  const path = document ? `/${document}${collection ? `/${collection}` : ''}`: '';
  const url = `${baseUrl}${path}`;

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
 * 
 * @param {String} storeType - 'app' or 'user'
 * @param {String} document - The document to which the delete applies
 * @param {String|Object|Array<Object>} [collectionInput] - Collection name, or Object or Array of { collection: 'name', properties: ['propName'...] }
 */
export async function deleteData (storeType, document, collectionInput = null) {
  const baseUrl = `/api/data/${storeType}`;
  let url = `${baseUrl}/${document}`;
  let collections = collectionInput;

  if (typeof collections === 'string') {
    url += `/${collections}`;
    collections = false;
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
 * The service worker install lifecycle handler.
 */
export async function installDatabase () {
  /* eslint-disable no-unused-vars */
  db = await openDB(dbname, schemaVersion, {
    upgrade(db, oldVersion, newVersion, transaction, event) {
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
    
        // Do future migrations here...

        // cleanup all old objectStores after migration
        for (let oldVersion = schemaVersion - 1; oldVersion > -1; oldVersion--) {
          let oldStoreName = makeStoreName(storeType, oldVersion);
          if (db.objectStoreNames.contains(oldStoreName)) {
            db.deleteObjectStore(oldStoreName);
          }
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