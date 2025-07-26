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
import { isLoginActive, getUserProfile, loginEvents } from '../login.js';
import { makeStoreType, getStoreTypeDelim } from '../utils.js';

const store = {};
const page = 'home';
const noDataMarkup = '<strong>** No Data **</strong>'; 
const storeTypeDelim = getStoreTypeDelim();
const appStoreType = makeStoreType('app', 'public');
const debug = debugLib(page);
const updateDataHandlers = Object.create(null);

/**
 * Listen for updates coming off the web component, update the data store(s) (and databases) on change.
 * Once the store is updated, the changes are batched and combined in the worker backend, upsert/delete.
 * This demo just shows multiple instances updates and deletes on collections...
 *   ...But you could add and delete entire collections and even entire documents.
 *
 * @param {String} storeType - keyPath to the document
 * @param {String} doc - The document to update
 * @param {String} collection - The collection to update
 * @param {Event} e - The 'change' event from the web component
 */
function updateData (storeType, doc, collection, e) {
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
}

/**
 * Only allow updates if logged in.
 * 
 * @returns {Boolean} true if login active, false otherwise
 */
function canUpdate () {
  return isLoginActive();
}

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
  // strip any hex hash in storeType
  let predicate = [
    ...key[0].split(storeTypeDelim).filter(t => !/^[0-9a-fA-F]+$/.test(t)),
    ...key.slice(1)
  ].join('-');
  const storeType = key[0];
  const doc = key[1];
  const collection = key[2];

  switch (collection) {
    case 'content':
      for (const [prop, val] of Object.entries(object)) {
        const id = `${predicate}-${prop}`; // content IDs are storeType-document-collection-property
        debug(`Updating content ${id}...`);
        el = document.getElementById(id);
        el.innerText = val;
      }
      break;

    case 'state':
      debug(`Updating state ${predicate}`);

      // Get a reference to the editable-object component
      el = document.getElementById(predicate); // collecion IDs are storeType-document-collection

      // Only allow updates if logged in
      el.onAdd = el.onEdit = el.onRemove = canUpdate;

      // Listen for updates coming off the web component, update the data store(s) (and databases) on change.
      if (!updateDataHandlers[predicate]) {
        updateDataHandlers[predicate] = updateData.bind(
          null, storeType, doc, collection
        );
        el.addEventListener('change', updateDataHandlers[predicate]);
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
 * Setup the logged in user.
 */
async function setupUser () {
  const appPublicStateControl = document.getElementById(`app-public-${page}-state`);
  const userIntroControl = document.getElementById(`user-${page}-content-intro`);
  const userStateControl = document.getElementById(`user-${page}-state`);

  const profile = getUserProfile();
  const { storeType: userStoreType } = profile;

  storeEvents.addEventListener('update', [userStoreType, '', ''], () => {
    userStateControl.object = {};
  });
  storeEvents.addEventListener('update', [userStoreType, page, 'content'], updatePage);
  storeEvents.addEventListener('update', [userStoreType, page, 'state'], updatePage);

  // New user case / No intro text
  setTimeout(() => {
    if (!userIntroControl.innerText) {
      userIntroControl.innerHTML = noDataMarkup;
    }
  }, 3000);

  // User can edit appPublic controls if isAdmin
  appPublicStateControl.disableEdit = !(profile?.isAdmin);

  store[userStoreType] = await getUserStore(page, userStoreType);

  // If no user page or state data, set it up.
  // This causes a new document and/or collection to be created on the remote data service.
  //
  // (This is the glory of the simplicity of idb/service-worker backed persistent nanostores)
  // (If the app needed a mandatory initial user state, that could've been sent down with app data and assigned here)
  //
  if (!store[userStoreType][page]) {
    store[userStoreType][page] = {};
    store[userStoreType][page].state = {};
  } else if (!store[userStoreType][page].state) {
    store[userStoreType][page].state = {};
  }
}

/**
 * Setup the home page.
 * 
 * @param {Object} support - The browser support object
 */
export default async function setup (support) {
  debug('setup...', support);

  const appPublicStateControl = document.getElementById(`app-public-${page}-state`);

  storeEvents.addEventListener('update', [appStoreType, page, 'content'], updatePage);
  storeEvents.addEventListener('update', [appStoreType, page, 'state'], updatePage);
  storeEvents.addEventListener('update', [appStoreType, '', ''], () => {
    appPublicStateControl.object = { message: 'You forgot to setup the application state data' };
  });
  setTimeout(() => {
    const appPublicIntroControl = document.getElementById(`app-public-${page}-content-intro`);
    if (!appPublicIntroControl.innerText) {
      appPublicIntroControl.innerHTML = noDataMarkup;
    }
  }, 3000);

  loginEvents.addEventListener('login', async () => {
    await setupUser();
  });
  loginEvents.addEventListener('logout', () => {
    appPublicStateControl.disableEdit = true;
  });

  debug('requesting app (and user) data...');
  await Promise.all([
    (async () => {
      store[appStoreType] = await getApplicationStore(page, appStoreType);
    })(),
    (async () => {
      if (isLoginActive()) {
        await setupUser();
      }    
    })()
  ]);
}
