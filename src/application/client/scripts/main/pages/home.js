/**
 * The home page
 * 
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */
import {
  dataUpdate,
  pageSeed,
  filterSeed,
  requestDataRefresh
} from '../data.js';

const page = 'home';

window.App.add('pageDataUpdate', payload => {
  console.log('@@@ pageDataUpdate ', payload);

  const seed = JSON.parse(localStorage.getItem(page)) || undefined;
  localStorage.setItem(
    page, JSON.stringify(pageSeed(page, seed, payload))
  );

  dataUpdate(payload);
});

export default function setup (support) {
  console.log(`@@@ ${page} setup`, support);

  const seed = JSON.parse(localStorage.getItem(page));
  requestDataRefresh(filterSeed(page, seed, {
    storeTypes: ['app']
  }));
}
