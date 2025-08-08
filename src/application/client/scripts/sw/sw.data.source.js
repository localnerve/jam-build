/**
 * Service Worker Application data utility functions.
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
import { openDB } from 'idb';
import { getStoreTypeStore, makeStoreType } from '#client-utils/storeType.js';
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