/**
 * The home page
 * 
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */
import { updatePageData } from '../request.js';
import { createStore } from '../data.js';

import debugLib from '@localnerve/debug';

const debug = debugLib('home');
const page = 'home';

const appStore = await createStore('app', page);

async function testUpdate () {
  debug('@@@ testUpdate get state');
  const { state, friends } = appStore[page];
  debug('state: ', state);

  debug('@@@ testUpdate set state (2)');
  state.newItem = 'hello there';
  state.newItem2 = 'how you doin?';
  state.newItem3 = 'the weather is nice';

  debug('@@@ deleting state property newItem2');
  delete state.newItem2;

  debug('@@@ update friends');
  friends.newFriend = 'Fred Friendly';
  // !!!
  // TODO: handle if you delete newFriend right here - you will end up with a delete for a new property that never went.
  // So you'll have to check for a delete that wins over a put for the same collection or property.
}

/**
 * Setup the home page.
 * 
 * @param {Object} support - The browser support object
 */
export default async function setup (support) {
  debug(`${page} setup...`, support);

  await updatePageData(page);

  setTimeout(testUpdate, 15000);
}
