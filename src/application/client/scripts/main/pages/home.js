/**
 * The home page.
 * Demonstrates full data lifecycle using vanilla Object proxied persistent nanostores.
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
import debugLib from '@localnerve/debug';
import '@localnerve/editable-object';
import { makeStoreType, storeTypeToArrayWithoutUserId } from '#client-utils/storeType.js';
import setupStores, { storeEvents, buildNewDocumentIfRequired } from '#client-main/stores.js';
import { getUserStore } from '#client-main/user.js';
import { getApplicationStore } from '#client-main/app.js';
import { isLoginActive, getUserProfile, loginEvents } from '#client-main/login.js';

const store = {};
const page = 'home';
const noDataMarkup = '<strong>** No Data **</strong>'; 
const appStoreType = makeStoreType('app', 'public');
const debug = debugLib(page);
const updateDataHandlers = Object.create(null);
let appStoreReady;

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

  // It's safe to update the store here because we DONT listen to 'put' or 'delete' mutations with this handler
  // Just 'update', otherwise we'd get called multiple times
  switch(detail.action) {
    case 'add':
    case 'edit': // 'put' is upsert, see ../data.js:queueMutation
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
 * Update policy. Only allow updates if logged in.
 * 
 * @returns {Boolean} true if login active, false otherwise
 */
function canUpdate () {
  return isLoginActive();
}

/**
 * If needed, connect the given editableObject ctrl to get and send updates.
 * Listens for updates coming off the web component, updates the data store(s) (and databases) on 'change'.
 * 
 * @param {EdtiableObject} ctrl - The EditableObject control instance
 * @param {String} storeType - The key path to the document
 * @param {String} doc - The document name
 * @param {String} col - The collection name
 */
function connectEditableObject (ctrl, storeType, doc, col) {
  if (!updateDataHandlers[ctrl.id]) {
    updateDataHandlers[ctrl.id] = updateData.bind(
      null, storeType, doc, col
    );

    // Only allow updates if logged in
    ctrl.onAdd = ctrl.onEdit = ctrl.onRemove = canUpdate;

    // Handle component change events
    ctrl.addEventListener('change', updateDataHandlers[ctrl.id]);
  }
}

/**
 * Store 'update' event handler.
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
  let predicate = [...storeTypeToArrayWithoutUserId(key[0]), ...key.slice(1)].join('-');
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
      el = document.getElementById(predicate); // collecion IDs are storeType-document-collection
      connectEditableObject(el, storeType, doc, collection);
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
    userStateControl.object = { message: 'Initializing demo user state...' };
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

  debug('setupUser, store:', store);

  let updated = buildNewDocumentIfRequired(store, userStoreType, page, 'state');
  if (updated) {
    userStateControl.object = {};
    connectEditableObject(userStateControl, userStoreType, page, 'state');
  }

  if (profile?.isAdmin) {
    await appStoreReady;
    updated = buildNewDocumentIfRequired(store, appStoreType, page, 'state');
    if (updated) {
      appPublicStateControl.object = {};
      connectEditableObject(appPublicStateControl, appStoreType, page, 'state');
    }
  }
}

/**
 * Setup the home page.
 * 
 * @param {Object} support - The browser support object
 */
export default async function setup (support) {
  debug('setup...', support);

  setupStores(support);

  const appPublicStateControl = document.getElementById(`app-public-${page}-state`);

  storeEvents.addEventListener('update', [appStoreType, page, 'content'], updatePage);
  storeEvents.addEventListener('update', [appStoreType, page, 'state'], updatePage);
  storeEvents.addEventListener('update', [appStoreType, '', ''], () => {
    appPublicStateControl.object = { message: 'Login as admin to init app state' };
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
      appStoreReady = getApplicationStore(page, appStoreType);
      store[appStoreType] = await appStoreReady;
    })(),
    (async () => {
      if (isLoginActive()) {
        await setupUser();
      }
    })()
  ]);
}
