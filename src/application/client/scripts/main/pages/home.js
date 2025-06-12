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
import { isLoginActive } from '../login.js';

// import { stringifyObject } from '../utils.js';

const page = 'home';

const debug = debugLib(page);

const store = {};

/*
function testUserStore () {
  const homeStore = userStore[page];
  const { state, friends } = homeStore;
  debug('state: ', state);

  state.newItem = 'hello there, mr man';
  state.newItem2 = 'how you doin?';
  state.newItem3 = 'the weather is nice today';
  state.property2 = 'Updated property2, chachacha';

  delete state.newItem2;

  friends.newFriend = 'Christina M';
  friends.newFriend2 = 'Janey Hamilton';
  friends.newFriend3 = 'Lea Cyr';
  friends.newFriend4 = 'Bad Person';

  delete friends.newFriend4;
  delete state.property1;
  delete state.property4;

  homeStore.user = {
    newProp1: 'newValue100',
    newProp2: 'newValue200',
    newProp3: 'newValue300',
    newProp31: 'newValue31',
    newProp4: 'newValue400'
  };

  delete homeStore.user.newProp31;
}
*/
/*
function wholeDocuments () {
  const homeStore = appStore[page];

  // try to copy the whole document
  appStore.newHome = JSON.parse(JSON.stringify(homeStore));

  // try to delete the whole page document
  delete appStore[page];
}
*/
/*
function updateAppAfter () {
  const homeStore = appStore[page];
  const { state, newCollection } = homeStore;
  debug('Updated state: ', state);

  debug('Still wired?');
  state.property1 = 'Updated Property1';
  newCollection.newProp4 = 'Updated Property4';
}
*/
/*
async function testAppStore () {
  const homeStore = appStore[page];
  const { state, friends } = homeStore;
  debug('state: ', state);

  state.newItem = 'hello there';
  state.newItem2 = 'how you doin?';
  state.newItem3 = 'the weather is nice';

  delete state.newItem2;

  friends.newFriend = 'Fred Friendly';
  friends.newFriend2 = 'Dolly Parton';
  friends.newFriend3 = 'Don Johnson';

  delete friends.newFriend;
  delete state.property1;
  delete state.property4;

  delete homeStore.friends;

  homeStore.newCollection = {
    newProp1: 'newValue1',
    newProp2: 'newValue2',
    newProp3: 'newValue3',
    newProp31: 'newValue31',
    newProp4: 'newValue4'
  };

  delete homeStore.newCollection.newProp31;
}
*/

/**
 * Update the UI for application and user data.
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

  // Thinking out loud in random comments...:
  // This test is actually pretty ugly.
  // I'm deciding if I should add 'op' filtering too (in addition to compound keys) to avoid this kind of crap leaking out into every handler.
  // Otherwise, every single 'update', 'delete', or 'put' comes in here, but we really only want 'update'.
  // There will be use cases (cross-component shared updates) who will want to keep up to date with every
  // mutation, some that are only for certain keys, certain ops...
  // The key passed in is not the complete key. In other words, if a client listens for [1,2,3] he gets [1,2,3] so he knows what to expect/parse.
  // It's not the complete key, just the subkey (compound) that is a match that the client said he wanted. I could also provide the complete key...
  // Maybe the solution should be similar for 'op'. You listen for 'op', you get 'op'.

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
      el = document.getElementById(predicate); // collecion IDs are storeType.document.collection

      // Listen for updates coming off the web component, update the data store(s) on change.
      // Once the store is updated, the changes are batched and combined for efficient updates on the worker backend, upsert/delete.
      // For the 'state' collection, its all prop updates in the one collection.
      // You can add and delete entire collections and even documents (a doc is a series of collection objects).

      el.addEventListener('change', e => {
        const { detail } = e;
        const { key: prop, new: val } = detail;

        debug('editable-object change', detail);

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

  storeEvents.addEventListener(['app', page, 'content'], updatePage);
  storeEvents.addEventListener(['user', page, 'content'], updatePage);
  storeEvents.addEventListener(['user', page, 'state'], updatePage);

  store.app = await getApplicationStore(page);
  // setTimeout(testAppStore, 100);
  // setTimeout(updateAppAfter, 25000); // after the failures
  // setTimeout(wholeDocuments, 50000);

  if (isLoginActive()) {
    store.user = await getUserStore(page);
  }

  // Test user store
  window.App.add('login-action-login', async () => {
    store.user = await getUserStore(page);
    // setTimeout(testUserStore, 100);
  }); 
}
