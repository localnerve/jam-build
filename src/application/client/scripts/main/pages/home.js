/**
 * The home page
 * 
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */
import {
  dataUpdate,
  pageSeed,
  requestDataRefresh
} from '../data.js';

window.App.add('pageDataUpdate', payload => {
  console.log('@@@ pageDataUpdate ', payload);

  const page = 'home';
  const seed = JSON.parse(localStorage.getItem(page));
  localStorage.setItem(
    page, JSON.stringify(pageSeed(page, seed || {}, payload))
  );

  dataUpdate(payload);
});

export default function setup (support) {
  console.log('@@@ home setup', support);

  requestDataRefresh(JSON.parse(localStorage.getItem('home')));
}
