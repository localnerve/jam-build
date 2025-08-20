/**
 * Handle login
 * 
 * Build time replacements:
 *   process.env.AUTHZ_URL - The url to the Authorizer Service
 *   process.env.AUTHZ_CLIENT_ID - The Authorizer client id
 * 
 * Jam-build, a web application practical reference.
 * Copyright (c) 2025 Alex Grant <info@localnerve.com> (https://www.localnerve.com), LocalNerve LLC
 * 
 * This file is part of Jam-build.
 * Jam-build is free software: you can redistribute it and/or modify it
 * under the terms of the GNU Affero General Public License as published by the Free Software
 * Foundation, either version 3 of the License, or (at your option) any later version.
 * Jam-build is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY;
 * without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 * See the GNU Affero General Public License for more details.
 * You should have received a copy of the GNU Affero General Public License along with Jam-build.
 * If not, see <https://www.gnu.org/licenses/>.
 * Additional terms under GNU AGPL version 3 section 7:
 * a) The reasonable legal notice of original copyright and author attribution must be preserved
 *    by including the string: "Copyright (c) 2025 Alex Grant <info@localnerve.com> (https://www.localnerve.com), LocalNerve LLC"
 *    in this material, copies, or source code of derived works.
 */
import { Authorizer } from '@localnerve/authorizer-js';
import debugLib from '@localnerve/debug';
import { hashDigest, mainBroadcastChannel } from '#client-utils/browser.js';
import { makeStoreType } from '#client-utils/storeType.js';

const debug = debugLib('login');

let listeners = [];
let authRef;
let broadcastChannel;

/**
 * Initialize the interface to the authorizer service.
 * Uses bundled endpoint location/id unless override supplied.
 * 
 * @return {Object} Authorizer reference
 */
export function initializeAuthorizer () {
  if (!authRef) {
    let authorizerURL, clientID;

    if (window.__authorizerOverrides) {
      ({ authorizerURL, clientID } = window.__authorizerOverrides);
    } else {
      authorizerURL = process.env.AUTHZ_URL; // eslint-disable-line no-undef -- defined at bundle time
      clientID = process.env.AUTHZ_CLIENT_ID; // eslint-disable-line no-undef -- defined at bundle time
    }

    authRef = new Authorizer({
      authorizerURL,
      clientID,
      redirectURL: window.location.origin 
    });
  }

  return authRef;
}

/**
 * Check the login sessionStorage value to see if the login access token is active.
 * If not, you need to login again... (unless I change this policy).
 * 
 * @returns {Boolean} true if access_token is active, false otherwise
 */
export function isLoginActive () {
  const login = JSON.parse(sessionStorage.getItem('login') || null);

  if (login) {
    const endTime = new Date(login.startTime + (login.expires_in * 1000)).getTime();
    const active = Date.now() - endTime;
    if (active < 0) {
      debug('login active');
      return true;
    }
  }

  return false;
}

/**
 * Get the user profile from sessionStorage.
 * 
 * @returns {Object} The user profile object, or null if not access_token not active
 */
export function getUserProfile () {
  if (isLoginActive()) {
    return JSON.parse(sessionStorage.getItem('user') || null);
  }
  
  sessionStorage.setItem('user', '');
  return null;
}

/**
 * Wire-up login events
 */
function setupLoginEvents () {
  const fireEvents = type => {
    for (const listener of listeners) {
      if (listener.type === type) listener.callback();
    }
  };

  window.App.add('login-action-login', () => {
    fireEvents('login');
  });

  window.App.add('login-action-logout', () => {
    fireEvents('logout');
  });
}

/**
 * Allow clients to listen to login events.
 */
export const loginEvents = {
  /**
   * Add a login event listener.
   * 
   * @param {String} type - 'login' or 'logout'
   * @param {Function} callback - Recieves no args
   */
  addEventListener (type, callback) {
    listeners.push({ type, callback });
  },

  /**
   * Removes the event listener, matched by function.
   */
  removeEventListener (type, callback) {
    listeners = listeners.filter(i => !(i.type === type && i.callback === callback));
  }
};

/**
 * Check to see if this is being called back in the PKCE login flow.
 * 
 * @returns {Boolean} true if this is actively in PKCE login flow, false otherwise
 */
function isLoginCallback () {
  const params = new URLSearchParams(window.location.search);
  const state = params.get('state'); 

  if (state) {
    let clientID;
    try {
      clientID = JSON.parse(atob(state)).clientID;
      return !!clientID;
    } catch {
      console.warn('bad qs for state'); // eslint-disable-line
    }
  }
  
  return false;
}

/**
 * Get the login user interface elements.
 * 
 * @returns {Object} An object containing the login ui elements by name
 */
function getLoginUIElements () {
  const hdrStatusText = document.querySelector('.ln-header .status p');
  const main = document.querySelector('main');
  const loginButtons = Array.from(document.querySelectorAll('.login-button, nav .login'));

  return {
    hdrStatusText, main, loginButtons
  };
}

/**
 * Set the UI elements from the profile.
 */
function updateUI (profile, { hdrStatusText, loginButtons, main }) {
  const message = profile ? `Welcome, ${profile.email}` : '';
  const loggedIn = 'logged-in';

  hdrStatusText.innerHTML = message;
  
  loginButtons.forEach(el => {
    el.classList[profile ? 'add' : 'remove'](loggedIn);
  });
  
  main.classList[profile ? 'add' : 'remove'](loggedIn);
}

/**
 * Called after successful login for additional handling.
 * Get user profile if needed, set sessionStorage, send login-action-login, update UI.
 * 
 * @param {Object} login - The login data returned from authorizerDev API call
 * @param {Object} [login.user] - The login user profile
 * @param {String} login.expires_in - The timespan of expiry in milliseconds
 * @param {Boolean} [isAdmin] - True if admin login, false otherwise, defaults to false
 * @returns {Boolean} true on success, false otherwise
 */
export async function processLogin (login, isAdmin = false) {
  const pageSpinner = document.querySelector('.page-spinner');
  pageSpinner.classList.remove('show');

  if (login && !login.user) {
    const { data: profile, errors: profileErrors } = await authRef.getProfile({
      Authorization: `Bearer ${login.access_token}`,
    });

    if (!profileErrors.length) {
      login.user = profile;
    }
  }

  let result = false;

  if (login?.user) {
    sessionStorage.setItem('login', JSON.stringify({
      startTime: Date.now(),
      expires_in: login.expires_in
    }));

    const userId = await hashDigest(login.user.email);

    sessionStorage.setItem('user', JSON.stringify({
      email: login.user.email,
      userId,
      storeType: makeStoreType('user', userId),
      isAdmin
    }));

    window.App.exec('login-action-login');

    const uiElements = getLoginUIElements();
    updateUI(login.user, uiElements);

    result = true;
  } else {
    window.App.exec('pageGeneralMessage', {
      args: {
        message: 'Could not process login',
        class: 'error',
        duration: 4000
      }
    });
  }

  return result;
}

/**
 * Called after a successful logout for additional handling.
 */
function processLogout () {  
  sessionStorage.setItem('login', '');
  sessionStorage.setItem('user', '');
  
  const uiElements = getLoginUIElements();
  updateUI(null, uiElements);
  
  window.App.exec('login-action-logout');
}

/**
 * Handle the 'logout-complete' message from the service worker.
 *
 * @param {Event} event - The service worker event
 */
async function logoutComplete (event) {
  const pageSpinner = document.querySelector('.page-spinner');
  const msgId = event?.data?.meta;

  if (msgId === 'logout-complete') {
    await authRef.logout();
    pageSpinner.classList.remove('show');
    processLogout();
  }
}

/**
 * Do the entire logout sequence.
 * Sends message to the service worker and waits for the 'logout-complete' message.
 * The worker may be batch processing, so we have to wait before credentials are destroyed.
 */
export async function logout () {
  if ('serviceWorker' in navigator) {
    const pageSpinner = document.querySelector('.page-spinner');
    const profile = getUserProfile();
    const reg = await navigator.serviceWorker.ready;
    
    pageSpinner.classList.add('show');

    reg.active.postMessage({
      action: 'logout',
      payload: {
        storeType: profile.storeType
      }
    });
  } else {
    await authRef.logout();
    processLogout();
    broadcastChannel.postMessage({
      action: 'process-logout'
    });
  }
}

/**
 * Event handler for login/logout click events.
 * 
 * @param {Event} event - The click event object
 */
async function loginHandler (event) {
  event.preventDefault();

  const loggedIn = isLoginActive();

  if (!loggedIn) {
    debug('loginHandler detected NOT ACTIVE login');

    history.pushState(null, '', window.location.url); // without this, back button from login goes nowhere

    const pageSpinner = document.querySelector('.page-spinner');
    pageSpinner.classList.add('show');

    const { data: login, errors: loginErrors } = await authRef.authorize({
      response_type: 'code',
      use_refresh_token: false
    });

    debug('loginHandler authorize response', login);

    if (!loginErrors.length && login?.access_token) {
      const result = await processLogin(login);

      if (result) {
        broadcastChannel.postMessage({
          action: 'process-login',
          payload: { login }
        });
      }
    }
  } else {
    debug('loginHandler detected ACTIVE login');
    await logout();
  }
}

/**
 * Handler of broadcast messages.
 * 
 * @param {Event} event - The broadcast channel event
 */
async function broadcastHandler (event) {
  const { action, payload = {} } = event.data;

  switch (action) {
    case 'process-login':
      await processLogin(payload.login, payload.isAdmin);
      break;

    // non-service-worker only
    case 'process-logout':
      await processLogout();
      break;

    default:
      break;
  }
}

/**
 * Called every login setup.
 * Installs the login/logout handlers, updates the UI with login status.
 */
export default async function setup (support) {
  debug('setup...', support);

  const uiElements = getLoginUIElements();
  
  if (support.hasBroadcastChannel) {
    broadcastChannel = new BroadcastChannel(mainBroadcastChannel);
    broadcastChannel.addEventListener('message', broadcastHandler);
  } else {
    broadcastChannel = { postMessage: ()=>{} };
  }

  if (support.serviceWorker) {
    navigator.serviceWorker.addEventListener('message', logoutComplete);
  }

  initializeAuthorizer();
  setupLoginEvents();

  // Install the login/logout handlers
  uiElements.loginButtons.forEach(el => {
    el.dataset.listener = true;
    el.addEventListener('click', loginHandler);
  });

  if (isLoginCallback()) {
    debug('finishing login from callback');

    const { data: login, errors: loginErrors } = await authRef.authorize({
      response_type: 'code',
      use_refresh_token: false
    });
    
    if (!loginErrors.length && login?.access_token) {
      const result = await processLogin(login);

      if (result) {
        broadcastChannel.postMessage({
          action: 'process-login',
          payload: { login }
        });
      }
    }
  } else {
    debug('getting user profile');

    const profile = getUserProfile();
    
    if (profile) {
      updateUI(profile, uiElements);
    }
  }
}