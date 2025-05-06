/**
 * Service Worker application data handling.
 * 
 * Build time replacements:
 *   API_VERSION - The X-Api-Version header value that corresponds to the api for this app version.
 *   SCHEMA_VERSION - The schema version corresponding to this app version.
 *
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */
import { openDB } from 'idb';

const dbname = 'jam_build';
const storeTypes = ['app', 'user'];
const schemaVersion = SCHEMA_VERSION; // eslint-disable-line -- assigned at bundle time
const apiVersion = API_VERSION; // eslint-disable-line -- assigned at bundle time

let blocked = false;
let db;

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
 * Refresh the local store copy with remote data.
 * TODO: add event to alert the app that potentially new data has arrived.
 *
 * @param {String} storeType - 'app' or 'user'
 * @param {String} [path] - '' == all, /:document, /:document/:collection
 */
export async function refreshData (storeType, path = '') {
  const baseUrl = `/api/data/${storeType}`;
  const sep = path ? '/' : '';

  const response = await fetch(`${baseUrl}${sep}${path}`, {
    headers: {
      'X-Api-Version': apiVersion,
      'Content-Type': 'application/json'
    }
  });
  if (response.ok) {
    const data = await response.json();
    const storeName = makeStoreName(storeType);

    // format and store the data
    for (const [doc_name, col] of Object.entries(data)) {
      for (const [col_name, props] of Object.entries(col)) {
        await db.put(storeName, {
          document_name: doc_name,
          collection_name: col_name,
          properties: props
        });
      }
    }
  } else {
    throw new Error(`[${response.status}] GETting ${baseUrl}${sep}${path}`);
  }
}

/**
 * Synchronize local data updates with the remote data service.
 * TODO: If background-sync supported, leverage workbox cache/post workflow for queuing persistent offline retries
 * 
 * @param {String} storeType - 'app' or 'user'
 * @param {String} document - The document to which the update applies
 * @param {Object} body - The collection(s) and their properties to update, can be incomplete for upsert
 */
export async function writeThrough (storeType, document, body) {
  const baseUrl = `/api/data/${storeType}`;
  const response = await fetch(`${baseUrl}/${document}`, {
    method: 'POST',
    headers: {
      'X-Api-Version': apiVersion,
      'Content-Type': 'application/json'
    },
    body // TODO: format/workout the local/remote format differences, if any
  });
  if (!response.ok) {
    throw new Error(`[${response.status}] POSTing ${baseUrl}/${document}`);
  }
}

/**
 * The service worker install lifecycle handler.
 */
export async function installDatabase () {
  /* eslint-disable no-unused-vars */
  db = await openDB(dbname, schemaVersion, {
    upgrade(db, oldVersion, newVersion, transaction, event) {
      storeTypes.forEach(storeType => {
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
      });
    },
    blocked(currentVersion, blockedVersion, event) {
      blocked = true;
    },
    async blocking(currentVersion, blockedVersion, event) {
      db.close();

      if (self.clients) {
        await self.clients.matchAll().then(clients => {
          for (let i = 0; i < clients.length; i++) {
            clients[i].postMessage({
              meta: 'database-update-required'
            });
          }
        });
      }
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