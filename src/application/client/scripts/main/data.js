/**
 * Main thread data access.
 * 
 * A persistent nanostore proxy on indexeddb.
 * 
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */
import { openDB } from 'idb';
import { setPersistentEngine } from '@nanostores/persistent';
export { persistentMap } from '@nanostores/persistent';

const storeNames = new Map();

let db;
let listeners = [];

function onChange (key, newValue) {
  const event = { key, newValue };
  for (const i of listeners) {
    i(event);
  }
}

export function pageSeed (page, seed = {}, next = null) {
  if (!next) {
    return seed;
  }

  const newCollections = next.keys.reduce((acc, [doc, col]) => {
    if (doc === page) {
      acc.push(col);
    }
    return acc;
  }, []);

  seed[`${next.storeType}:${page}`] = {
    storeType: next.storeType,
    document: page,
    collections: newCollections
  };

  return seed;
}

export function filterSeed (page, seed, {
  storeTypes = ['app', 'user'],
  collections = []
} = {}) {
  if (!seed) {
    return seed;
  }

  const inputColl = new Set(collections);

  return Object.entries(seed).reduce((acc, [key, payload]) => {
    const payloadColl = new Set(payload.collections);
    const [keyType, keyPage] = key.split(':');

    if (storeTypes.includes(keyType) && page === keyPage) {
      const filteredColl = [...payloadColl.intersection(inputColl)];

      acc[`${keyType}:${keyPage}`] = {
        storeType: keyType,
        document: keyPage,
        collections: !filteredColl.length ? undefined : filteredColl
      };
    }

    return acc;
  }, {});
}

export async function requestDataRefresh (seed) {
  console.log('@@@ requestDataRefresh', seed);

  if ('serviceWorker' in navigator && seed) {
    const reg = await navigator.serviceWorker.ready;
    for (const [, payload] of Object.entries(seed)) {
      reg.active.postMessage({ 
        action: 'refresh-data',
        payload
      });
    }
  }
}

// handler for App database-data-update event
export async function dataUpdate ({ dbname, storeType, storeName, keys }) {
  if (!db) {
    db = await openDB(dbname);
  }
  if (!storeNames.has(storeType)) {
    storeNames.set(storeType, storeName);
  }

  for (const [docName, colName] of keys) {
    const entry = await db.get(storeName, [docName, colName]);
    onChange(`${storeType}:${docName}:${colName}`, entry.properties);
  }
}

const batchTime = 3000;
const batch = {
  put: [],
  delete: []
};
const timers = {
  put: 0,
  delete: 0
};
async function batchMutation (op, storeType, document, collection) {
  clearTimeout(timers[op]);

  if (!batch[op].includes(collection)) {
    batch[op].push(collection);
  }

  timers[op] = setTimeout(async () => {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready;
      reg.active.postMessage({
        action: `${op}-data`,
        payload: {
          storeType,
          document,
          collections: batch[op]
        }
      });
    }
    batch[op].length = 0;
  }, batchTime);
}

function queueMutation (op, key, value, notify) {
  const keyParts = key.split(':');
  const storeType = keyParts[0];
  const keyPath = keyParts.slice(1);
  const storeName = storeNames.get(keyParts[0]);

  const param = op == 'delete' ? keyPath : {
    document_name: keyPath[0],
    collection_name: keyPath[1],
    properties: value
  };

  // queue microTask to update db, send notification to app, queue remote sync
  Promise.resolve()
    .then(() => db[op](storeName, param))
    .then(() => {
      notify(key, value);
      batchMutation(op, storeType, keyPath[0], keyPath[1]);
    });

}

const storage = new Proxy({}, {
  set(target, name, value) {
    target[name] = value;
    queueMutation('put', name, value, onChange);
  },
  get(target, name) {
    return target[name];
  },
  deleteProperty(target, name) {
    delete target[name];
    queueMutation('delete', name, undefined, onChange);
  }
});

const events = {
  addEventListener (key, callback) {
    listeners.push(callback);
  },
  removeEventListener (key, callback) {
    listeners = listeners.filter(i => i !== callback);
  },
  perKey: true
};

setPersistentEngine(storage, events);