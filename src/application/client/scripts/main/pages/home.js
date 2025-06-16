/**
 * The home page
 * 
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */
import debugLib from '@localnerve/debug';
import '@localnerve/editable-object';

import { storeEvents } from '../data.js';
import { getUserStore } from '../user.js';
import { getApplicationStore } from '../app.js';
import { isLoginActive, getUserProfile } from '../login.js';

const page = 'home';

const debug = debugLib(page);

const store = {};

/**
 * On the store 'update' event, update the UI for application and user data.
 * Looks for collections named:
 *   'content'
 *   'state'
 * 
 * @param {Object} payload - key [storeType, document, collection], value [object]
 * @param {Array<String>} payload.key - The [storeType, document, collection] identifying predicate
 * @param {Object} payload.value - The object with properties to update
 */
function updatePage ({ key, value: object }) {
  debug('updatePage: ', key, object);

  // just make sure we didn't get trash
  if (typeof object !== 'object' || object === null) {
    return;
  }

  let el;
  let predicate = key.join('.');
  const storeType = key[0];
  const doc = key[1];
  const collection = key[2];

  switch (collection) {
    case 'content':
      for (const [prop, val] of Object.entries(object)) {
        const id = `${predicate}.${prop}`; // content IDs are storeType.document.collection.property
        debug(`Updating content ${id}...`);
        el = document.getElementById(id);
        el.innerText = val;
      }
      break;

    case 'state':
      debug(`Updating state ${predicate}`);

      // Get a reference to the editable-object component
      el = document.getElementById(predicate); // collecion IDs are storeType.document.collection

      // Listen for updates coming off the web component, update the data store(s) (and databases) on change.
      // Once the store is updated, the changes are batched and combined for efficient updates on the worker backend, upsert/delete.
      // For the 'state' collection, its all prop updates in the one collection.
      // However, you could add and delete entire collections and even documents (a doc is a series of collection objects).

      el.addEventListener('change', e => {
        const { detail } = e;
        const { key: prop, new: val } = detail;

        debug('editable-object change', detail);

        // It's safe to update the store here because we DONT listen to 'put' or 'delete' mutations
        // Otherwise we'd get called twice
        switch(detail.action) {
          case 'add':
          case 'edit':
            store[storeType][doc][collection][prop] = val;
            break;
          case 'remove':
            delete store[storeType][doc][collection][prop];
            break;
          default:
            debug('editable-object change - unknown event, check the code...');
            break;
        }
      });

      if (storeType === 'app') {
        const profile = getUserProfile();
        el.disableEdit = !(profile?.isAdmin);
      }

      // Give the data to the web component...
      el.object = object;
      break;

    default:
      debug(`Skipping unknown object ${predicate}`);
      break;
  }
}

/**
 * Setup the home page.
 * 
 * @param {Object} support - The browser support object
 */
export default async function setup (support) {
  debug('setup...', support);

  storeEvents.addEventListener('update', ['app', page, 'content'], updatePage);
  storeEvents.addEventListener('update', ['app', page, 'state'], updatePage);
  storeEvents.addEventListener('update', ['user', page, 'content'], updatePage);
  storeEvents.addEventListener('update', ['user', page, 'state'], updatePage);

  await Promise.all([
    (async () => {
      store.app = await getApplicationStore(page);
    })(),
    (async () => {
      if (isLoginActive()) {
        store.user = await getUserStore(page);
      }    
    })()
  ]);

  window.App.add('login-action-login', async () => {
    store.user = await getUserStore(page);
  }); 
}
