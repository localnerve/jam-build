/**
 * The home page
 * 
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */
import {
  createMap,
  updatePageData
} from '../data.js';
//import { openDB } from 'idb';
import debugLib from '@localnerve/debug';

const debug = debugLib('home');
const page = 'home';

const appMap = createMap('app', page);

async function testUpdate () {
  debug('@@@ testUpdate get state');
  const map = appMap.get();
  const { state, friends } = map;
  debug('state: ', state);

  debug('@@@ testUpdate set state (2)');
  state.newItem = 'hello there';
  state.newItem2 = 'how you doin?';
  state.newItem3 = 'the weather is nice';
  appMap.setKey('state', state);
  debug('@@@ testUpdate set state *done*');

  debug('@@@ deleting state collection');
  appMap.setKey('state', undefined);
  debug('@@@ state deletion is *done*');

  debug('@@@ update friends');
  friends.newFriend = 'Fred Friendly';
  appMap.setKey('friends', friends);
  debug('@@@ update friends *done*');
  
  /*
  const db = await openDB('jam-build');
  const storedState = await db.get('app_documents_1', ['home', 'state']);
  debug('@@@ The storedState is ', storedState);
  */
}

/**
 * Setup the home page.
 * 
 * @param {Object} support - The browser support object
 */
export default async function setup (support) {
  debug(`${page} setup...`, support);

  await updatePageData(page);

  setTimeout(testUpdate, 10000);
}
