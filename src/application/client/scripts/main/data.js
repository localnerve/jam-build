/**
 * Basic application data handling for all pages.
 * 
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
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
  const fireEvents = (type, payload) => {
    for (const listener of listeners) {
      if (listener.type === type) listener.callback(payload);
    }
  };
  const { content: page } = document.querySelector('meta[name="page"]');
  
  debug(`setupDataEvents setting up events for ${page}`);

  /**
   * Install the handler for pageDataUpdate network callbacks from the service worker
   *   (window.App.add discards duplicate adds)
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