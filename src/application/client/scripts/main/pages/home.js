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

const debug = console.log; // eslint-disable-line
const page = 'home';

const appMap = createMap('app', page);

function testUpdate () {
  debug('@@@ testUpdate get state');
  const { state } = appMap.get();
  debug('state: ', state);

  /*
  debug('@@@ testUpdate set state');
  state.newItem = 'hello there';
  appMap.setKey('state', state);
  debug('@@@ testUpdate set state *done*');
  */
}

/**
 * Setup the home page.
 * 
 * @param {Object} support - The browser support object
 */
export default async function setup (support) {
  debug(`@@@ ${page} setup`, support);

  await updatePageData(page);

  setTimeout(testUpdate, 1000);
}
