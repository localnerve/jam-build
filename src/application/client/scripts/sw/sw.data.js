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
const schemaVersion = SCHEMA_VERSION; // eslint-disable-line
const apiVersion = API_VERSION; // eslint-disable-line

let blocked = null;
let versionChange = null;
let db;

/**
 * Make the storeName from the storeType.
 * 
 * @param {String} storeType - 'app' or 'user'
 * @returns {String} The objectStore name
 */
function makeStoreName (storeType) {
  return `${storeType}_documents`;
}

/**
 * Do the database upgrade work.
 * SCHEMA_VERSION - no migration or structure updates, just create if not exist.
 *
 * @param {IDBDatabase} db - A reference to the idb IDBDatabase interface 
 * @param {IDBVersionChangeEvent} event - An IDBVersionChangeEvent from versionchange, blocked or upgradeneeded
 * @param {IDBTransaction} [transaction] - A transaction object reference to facilitate data migrations
 */
/* eslint-disable-next-line no-unused-vars -- not using transaction for migration this release */
function upgradeDatabase (db, event, transaction = null) {
  versionChange = event;
  storeTypes.forEach(storeType => {
    const storeName = makeStoreName(storeType);
    if (!db.objectStoreNames.contains(storeName)) {
      const store = db.createObjectStore(storeName, { keyPath: ['document_name'] });
      store.createIndex('document_collection', ['document_name', 'collection_name'], {
        unique: true
      });
      store.createIndex('collection', 'collection_name');
    }
  });
}

/**
 * Format the remote data to the format for the local object stores.
 *
 * @param {Object} data - Remote data from the data service
 * @returns {Array} The document_collection records to store with in-line key names
 */
function flattenData (data) {
  const result = [];
  for (const [doc_name, col] of Object.entries(data)) {
    for (const [col_name, props] of Object.entries(col)) {
      const value = {};
      value.document_name = doc_name;
      value.collection_name = col_name;
      value.properties = JSON.parse(JSON.stringify(props)); // !! it feels weird to NOT do this
      result.push(value);
    }
  }
  return result;
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
    const data = flattenData(await response.json());
    for (const document_collection of data) {
      await db.put(makeStoreName(storeType), document_collection);
    }
  } else {
    throw new Error(`[${response.status}] GETting ${baseUrl}${sep}${path}`);
  }
}

/**
 * Synchronize local data updates with the remote data service.
 * TODO: see about leveraging workbox cache/post workflow for queuing persistent offline retries
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
      upgradeDatabase(db, event, transaction);
    },
    blocked(currentVersion, blockedVersion, event) {
      blocked = {
        db,
        event
      };
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
    upgradeDatabase(blocked.db, blocked.event);
    blocked = null;
  }

  await refreshData('app');

  if (versionChange) {
    // TODO: cleanup the old database
  }
}