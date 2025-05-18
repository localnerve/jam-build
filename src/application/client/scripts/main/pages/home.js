/**
 * The home page
 * 
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */
import { updatePageData } from '../request.js';
import { createStore, storeEvents } from '../data.js';
import debugLib from '@localnerve/debug';

const page = 'home';

const debug = debugLib(page);

let appStore;

function updatedData () {
  const homeStore = appStore[page];
  const { state } = homeStore;
  debug('Updated state: ', state);

  debug('Still wired?');
  state.property1 = 'Updated Property1';
}

async function testUpdate () {
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

  // should be
  // 2 upserts, state [newItem, newItem3], friends [newFriend2, newFriend3]
  // 2 deletes, state [newItem2 (nonexist), property1, property4], friends [newFriend (nonexist)]
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
  appStore = await createStore('app', page);

  // tests n stuff
  setTimeout(testUpdate, 10000);
  setTimeout(updatedData, 40000); // after the failures
}
