/**
 * Service Worker Application data utility functions.
 * 
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */
import { openDB } from 'idb';
import { sendMessage } from './sw.utils';
import {
  baseStoreType,
  batchStoreType,
  conflictStoreType,
  dbname,
  mainStoreTypes,
  schemaVersion,
  versionStoreType
} from './sw.data.constants';
import { getStoreTypeStore, makeStoreType } from '#client-utils/storeType.js';

// The per-thread database references
let db;
let blocked;

/**
 * Make the storeName from the storeType.
 * 
 * @param {String} storeType - store:scope path to document
 * @param {Number|String} [version] - The schema version, defaults to this version as compiled
 * @returns {String} The objectStore name
 */
export function makeStoreName (storeType, version = schemaVersion) {
  const store = getStoreTypeStore(storeType);
  return `${store}_documents_${version}`;
}

/**
 * Get a reference to the database.
 * 
 * @returns {IDBDatabase} An idb enhanced interface to an open IDBDatabase
 */
export async function getDB () {
  if (!db) {
    db = await openDB(dbname, schemaVersion);
  }
  return db;
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
          store.createIndex('scope', 'scope', {
            unique: false
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
        store.createIndex('record', ['storeType', 'document', 'collection', 'propertyName', 'op'], {
          unique: false
        });
        store.createIndex('ops', 'op', {
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
        store.createIndex('collection', ['storeType', 'document', 'collection'], {
          unique: true
        });
        store.createIndex('document', ['storeType', 'document'], {
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
 * 
 * @param {Function} refreshData - The refreshData function
 */
export async function activateDatabase (refreshData) {
  if (blocked) {
    blocked = false;
    await installDatabase();
  }
  
  await refreshData({ storeType: makeStoreType('app', 'public') });
}