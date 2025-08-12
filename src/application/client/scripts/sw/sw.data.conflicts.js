/**
 * Service Worker Application version conflict processing.
 * 
 * Jam-build, a web application practical reference.
 * Copyright (c) 2025 Alex Grant <info@localnerve.com> (https://www.localnerve.com), LocalNerve LLC
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
 *    by including the string: "Copyright (c) 2025 Alex Grant <info@localnerve.com> (https://www.localnerve.com), LocalNerve LLC"
 *    in this material, copies, or source code of derived works.
 */
import * as jsonDiffPatchLib from 'jsondiffpatch';
import { hasOwnProperty, isNullish, isObj } from '#client-utils/javascript.js';
import { getStoreTypeScope } from '#client-utils/storeType.js';
import {
  baseStoreType,
  conflictStoreType,
  dbname,
  versionStoreType
} from './sw.data.constants.js';
import { debug, sendMessage } from './sw.utils.js';
import { getDB, makeStoreName } from './sw.data.source.js';

const jsonDiffPatch = jsonDiffPatchLib.create({ omitRemovedValues: true });

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

    const getType = (obj, key) => Array.isArray(obj[key]) ? 'array' : typeof obj[key];
    const getValue = val => Array.isArray(val) ? val[val.length - 1] : val;

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
 * @param {Object} params - Processing parameters
 * @param {Function} params.processBatchUpdates - Function to trigger batch update processing
 * @param {Function} params.addToBatch - Function to add to batch
 */
export async function processVersionConflicts ({
  processBatchUpdates,
  addToBatch
}) {
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
      baseKeys.push([storeType, doc, col]);

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

  debug('processVersionConflicts wrote new records contained in the keys: ', message);

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

  // Queue the batch commands, if required
  debug('processVersionConflicts processing batch...', batch);
  for (const storeType of Object.keys(batch)) {
    for (const [, payload] of Object.entries(batch[storeType])) {
      if (!payload) continue;

      if (Array.isArray(payload.collections) && payload.collections.length > 0) {
        if (payload.collections.every(i => typeof i === 'string')) {
          for (const collection of payload.collections) {
            debug('Scheduling batch update: ', { ...payload, collection });
            await addToBatch({ ...payload, collection });
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
            await addToBatch(param);
          }
        }
      } else {
        debug('Scheduling batch update: ', payload);
        await addToBatch(payload); // storeType, document, op for a doc update
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