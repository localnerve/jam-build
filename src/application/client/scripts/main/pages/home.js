/**
 * The home page
 * 
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */
import debugLib from '@localnerve/debug';
import {
  dataUpdate,
  pageSeed,
  filterSeed,
  requestDataRefresh,
  persistentMap,
  events,
  initializeMap
} from '../data.js';

const debug = debugLib('home');

const page = 'home';
const map = new persistentMap('app:home:', {}, { listen: true });

function testUpdate () {
  debug('@@@ testUpdate get state');
  const state = map.get().state;
  debug('state: ', state);

  debug('@@@ testUpdate set state');
  state.newItem = 'hello there';
  //map.setKey('state', state);
  debug('@@@ testUpdate set state *done*');
}

window.App.add('pageDataUpdate', async payload => {
  debug('@@@ pageDataUpdate ', payload);

  const seed = JSON.parse(localStorage.getItem(page)) || undefined;
  localStorage.setItem(
    page, JSON.stringify(pageSeed(page, seed, payload))
  );

  events.addEventListener('', (key, value) => {
    debug('@@@ got update in listener', key, value);
  });

  await dataUpdate(payload);

  initializeMap(map);
});

export default function setup (support) {
  debug(`@@@ ${page} setup`, support);

  const seed = JSON.parse(localStorage.getItem(page));
  requestDataRefresh(filterSeed(page, seed, {
    storeTypes: ['app']
  }));

  setTimeout(testUpdate, 1000);
}
