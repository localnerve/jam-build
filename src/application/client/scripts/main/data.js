/**
 * Basic application data handling for all pages.
 * 
 * Jam-build, a web application practical reference.
 * Copyright (c) 2025 Alex Grant <info@localnerve.com>, LocalNerve LLC
 * 
 * This file is part of Jam-build.
 * Jam-build is free software: you can redistribute it and/or modify it
 * under the terms of the GNU Affero General Public License as published by the Free Software
 * Foundation, either version 3 of the License, or (at your option) any later version.
 * Jam-build is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY;
 * without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 * See the GNU Affero General Public License for more details.
 * You should have received a copy of the GNU Affero General Public License along with Jam-build.
 * If not, see <https://www.gnu.org/licenses/>
 */
import debugLib from '@localnerve/debug';
import { pageSeed } from './seed.js';

const debug = debugLib('data');

let listeners = [];

/**
 * Allow clients to listen to data events.
 */
export const dataEvents = {
  /**
   * Add a data event listener.
   * 
   * @param {String} type - data message type
   * @param {Function} callback - Recieves data message payload
   */
  addEventListener (type, callback) {
    listeners.push({ type, callback });
  },

  /**
   * Removes the event listener, matched by function and type.
   */
  removeEventListener (type, callback) {
    listeners = listeners.filter(i => !(i.type === type && i.callback === callback));
  }
};

/**
 * Wire-up data events to application mediator
 */
function setupDataEvents () {
  const { content: page } = document.querySelector('meta[name="page"]');
  const fireEvents = (type, payload) => {
    for (const listener of listeners) {
      if (listener.type === type) listener.callback(payload);
    }
  };
  
  debug(`setupDataEvents setting up events for ${page}`);

  /**
   * Install the handler for 'database-data-update' messages from the service worker.
   *   (window.App.add discards duplicate adds)
   * High priority event, executed in the application mediator inline in each page.
   *   @see inline/sw.js
   * This either gets called immediately bc the service worker installed and has init data ready,
   * or called shortly after a page calls to requestPageData and is called back.
   */
  window.App.add('pageDataUpdate', payload => {
    debug(`pageDataUpdate updating seed and firing events for ${page}`);

    // Update the request seed for the page with any new data that arrived
    const seed = JSON.parse(localStorage.getItem('seed')) || undefined;
    localStorage.setItem(
      'seed', JSON.stringify(pageSeed(page, seed, payload))
    );

    fireEvents('page-data-update', payload);
  });
}

export default function setup (support) {
  debug('setup...', support);

  setupDataEvents();
}