/**
 * The home page
 * 
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */
import debugLib from '@localnerve/debug';
import { storeEvents } from '../data.js';
import { getUserStore } from '../user.js';
import { getApplicationStore } from '../app.js';
import { isLoginActive } from '../login.js';

const page = 'home';

const debug = debugLib(page);

let appStore; // eslint-disable-line no-unused-vars
let userStore;

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
 * Send the data out to the UI
 * 
 * @param {Object} payload - key, value
 */
function updatePage ({ key, value }) {
  debug('updateContent: ', key, value);

  let predicate = key.join('.');

  for (const [name, content] of Object.entries(value)) {
    const id = `${predicate}.${name}`;

    debug(`Updating ${id}...`);
    const el = document.getElementById(id);
    if (el) {
      el.innerText = content;
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

  storeEvents.addEventListener(['app', page, 'content'], updatePage);
  storeEvents.addEventListener(['user', page, 'content'], updatePage);

  appStore = await getApplicationStore(page);
  // setTimeout(testAppStore, 100);
  // setTimeout(updateAppAfter, 25000); // after the failures
  // setTimeout(wholeDocuments, 50000);

  if (isLoginActive()) {
    userStore = await getUserStore(page);
  }

  // Test user store
  window.App.add('login-action-login', async () => {
    userStore = await getUserStore(page);
    setTimeout(testUserStore, 100);
  }); 
}
