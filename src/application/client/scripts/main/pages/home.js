/**
 * The home page
 * 
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */
import { updatePageData } from '../request.js';
import { pageSeed } from '../seed.js';
import { createStore, storeEvents } from '../data.js';
import debugLib from '@localnerve/debug';

const page = 'home';

const debug = debugLib(page);

let appStore;
let userStore;

function testUserStore () {
  const homeStore = userStore[page];
  const { state, friends } = homeStore;
  debug('state: ', state);

  state.newItem = 'hello there';
  state.newItem2 = 'how you doin?';
  state.newItem3 = 'the weather is nice';
  state.property2 = 'Updated property2';

  delete state.newItem2;

  friends.newFriend = 'Christina M';
  friends.newFriend2 = 'Janey Hamilton';
  friends.newFriend3 = 'Lea Cyr';

  delete friends.newFriend;
  delete state.property1;
  delete state.property4;

  homeStore.newCollection = {
    newProp1: 'newValue10',
    newProp2: 'newValue20',
    newProp3: 'newValue30',
    newProp31: 'newValue31',
    newProp4: 'newValue40'
  };

  delete homeStore.newCollection.newProp31;
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

/**
 * Setup the home page.
 * 
 * @param {Object} support - The browser support object
 */
export default async function setup (support) {
  debug('setup...', support);

  // Every page should have this startup to listen, refresh, and get stores.
  storeEvents.addEventListener(page, ({ key, value }) => {
    debug(`@@@ ${page} changed: `, key, value);
  });
  await updatePageData(page);

  // Test app store
  appStore = await createStore('app', page);

  setTimeout(testAppStore, 100);
  // setTimeout(updateAppAfter, 25000); // after the failures
  // setTimeout(wholeDocuments, 50000);

  // Test user store
  window.App.add('login-action-login', async () => {
    const seed = JSON.parse(localStorage.getItem(page)) || undefined;
    localStorage.setItem(page, JSON.stringify(pageSeed(page, seed, {
      storeType: 'user',
      keys: []
    })));
    await updatePageData(page, {
      storeTypes: ['user']
    });
    userStore = await createStore('user', page);
    setTimeout(testUserStore, 100);
  }); 
}
