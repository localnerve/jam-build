/**
 * Service Worker Application data handling helpers.
 * 
 * Jam-build, a web application practical reference.
 * Copyright (c) 2025 Alex Grant <info@localnerve.com>, LocalNerve LLC
 * 
 * This file is part of Jam-build.
 * Jam-build is free software: you can redistribute it and/or modify it
 * under the terms of the GNU Affero General Public License as published by the Free Software
 * Foundation, either version 3 of the License, or (at your option) any later version.
 * Jam-build is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY;
 * without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 * See the GNU Affero General Public License for more details.
 * You should have received a copy of the GNU Affero General Public License along with Jam-build.
 * If not, see <https://www.gnu.org/licenses/>.
 * Additional terms under GNU AGPL version 3 section 7:
 * a) The reasonable legal notice of original copyright and author attribution must be preserved
 *    by including the string: "Copyright (c) 2025 Alex Grant <info@localnerve.com>, LocalNerve LLC"
 *    in this material, copies, or source code of derived works.
 */
import { getStoreTypeScope } from '#client-utils/storeType.js';
import { debug, sendMessage, CriticalSection } from './sw.utils.js';
import {
  baseStoreType,
  batchStoreType,
  conflictStoreType,
  dbname,
  STALE_BASE_LIFESPAN,
  versionStoreType
} from './sw.data.constants.js';
import { getDB, makeStoreName } from './sw.data.source.js';

const csMayUpdate = new CriticalSection();

/**
 * Read data from local objectstores and send to the app.
 * localData is the fallback (stale) data in a Network First strategy.
 * 
 * @param {String} storeType - store:scope path to document
 * @param {String} document - The document name
 * @param {String|Array<String>} [collections] - collection name(s) to get
 * @param {String} [message] - A user message
 */
export async function localData (storeType, document, collections = null,
  message = 'A local copy of the data is being shown') {
  const storeName = makeStoreName(storeType);
  const scope = getStoreTypeScope(storeType);
  const db = await getDB();
  const keys = [];

  debug(`localData: storeType='${storeType}' scope='${scope}' document='${document}'`);

  if (document) {
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
 * Store put or delete successful mutation new version result.
 * 
 * @param {String} storeType - store:scope path to document
 * @param {String} document - The document name
 * @param {String} result - The mutation result payload
 */
export async function storeMutationResult (storeType, document, result) {
  const versionStoreName = makeStoreName(versionStoreType);
  const db = await getDB();

  await db.put(versionStoreName, {
    storeType,
    document,
    version: result.newVersion
  });
}

/**
 * Store data from the remote data service in the local object stores.
 * Re-formats data from the network to the idb objectStore format.
 * Sends message to the app with the new data.
 *
 * @param {String} storeType - store:scope path to document
 * @param {Object} data - The remote data to store
 */
export async function storeData (storeType, data) {
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
 * Store the version conflict resolution data to the objectStore.
 * Contains the current version and data for the document to be updated from the remote store,
 * along with the requested modication data of storeType, op (the modification), and the collections array.
 * 
 * @param {String} storeType - store:scope path to document
 * @param {String} op - 'put' or 'delete'
 * @param {Array<String>|Array<Object>|String} collections - The network request collections
 * @param {Object} data - The latest version of the remote document
 */
export async function storeVersionConflict (storeType, op, collections, data) {
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
 * Load data from local objectStores by document name or document and possible collection name(s).
 * Format the local data for *upsert* to the remote data service.
 *
 * @param {String} storeType - store:scope path to document
 * @param {String} document - The document name
 * @param {Array<String>} [collections] - An array of collection names
 */
export async function loadData (storeType, document, collections = null) {
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
 * @param {Queue} [queue] - The workboxjs Queue instance
 * @returns {Promise<Boolean>} returns true if pending updates found, false otherwise
 */
export async function hasPendingUpdates (queue) {
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
 * Clean the base document store after mutations.
 * 
 * @param {String} storeType - store:scope path to document
 * @param {String} document - The document that was updated
 */
export async function clearBaseStoreRecords (storeType, document) {
  const baseStoreName = makeStoreName(baseStoreType);
  const db = await getDB();

  let count = 0;
  const documents = await db.transaction(baseStoreName, 'readwrite').store.index('document');
  for await (const cursor of documents.iterate([storeType, document])) {
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
 * @param {String} payload.storeType - store:scope path to document
 * @param {String} payload.document - The document to be updated
 * @param {String} [payload.collection] - The collection to be updated
 * @param {Boolean} [clearOnly] - True to clear the record only, default false
 */
async function _mayUpdate ({ storeType, document, collection }, clearOnly = false) {
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
    const baseCopy = await db.getFromIndex(baseStoreName, 'collection', [storeType, document, collection]);
    const staleBase = baseCopy && (Date.now() - baseCopy.timestamp) >= STALE_BASE_LIFESPAN;

    if (!baseCopy || staleBase || clearOnly) {
      if ((staleBase || clearOnly) && baseCopy) {
        await db.delete(baseStoreName, baseCopy.id);
      }

      if (!clearOnly) {
        const original = await db.get(storeName, [scope, document, collection]);

        debug(`_mayUpdate collection [${scope},${document},${collection}] original: `, original);

        if (original) {
          await db.add(baseStoreName, {
            storeType, document, collection, timestamp: Date.now(), properties: original.properties
          });
        }
      }
    }
  } else {
    const documents = await db.transaction(baseStoreName, 'readwrite').store.index('document');
    const docCount = await documents.count([storeType, document]);
    let deleteCount = 0;

    for await (const cursor of documents.iterate([storeType, document])) {
      const item = cursor.value;
      const staleBase = Date.now() - item.timestamp >= STALE_BASE_LIFESPAN;

      if (staleBase || clearOnly) {
        deleteCount++;
        await cursor.delete();
      }
    }

    if ((docCount === 0 || docCount === deleteCount) && !clearOnly) {
      const original = await db.getAllFromIndex(storeName, 'document', [scope, document]);

      debug(`_mayUpdate document [${scope},${document}] original: `, original);

      if (original) {
        for (const orig of original) {
          await db.add(baseStoreName, {
            storeType,
            document,
            collection: orig.collection_name,
            timestamp: Date.now(),
            properties: orig.properties
          });
        }
      }
    }
  }
}

/**
 * Call _mayUpdate in a serial execution lock to force serial, complete fcfs execution.
 * 
 * @param {Array} args - args for _mayUpdate
 */
export async function mayUpdate (...args) {
  await csMayUpdate.execute(() => _mayUpdate(...args));
}
