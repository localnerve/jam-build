/**
 * Handle login
 * 
 * Build time replacements:
 *   process.env.AUTHZ_URL - The url to the Authorizer Service
 *   process.env.AUTHZ_CLIENT_ID - The Authorizer client id
 * 
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */
import { Authorizer } from '@localnerve/authorizer-js';
import debugLib from '@localnerve/debug';
import { hashDigest, makeStoreType } from './utils.js';

const debug = debugLib('login');

let listeners = [];
let authRef;

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
 * @returns {Boolean} true on success, false otherwise
 */
export async function processLogin (login) {
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
      isAdmin: login.user.roles.includes('admin')
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
export function processLogout () {
  sessionStorage.setItem('login', '');
  sessionStorage.setItem('user', '');
  
  const uiElements = getLoginUIElements();
  updateUI(null, uiElements);
  
  window.App.exec('login-action-logout');
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
    
    const { data: login, errors: loginErrors } = await authRef.authorize({
      response_type: 'code',
      use_refresh_token: false
    });

    debug('loginHandler authorize response', login);

    if (!loginErrors.length && login?.access_token) {
      await processLogin(login);
    }
  } else {
    debug('loginHandler detected ACTIVE login');

    await authRef.logout();
    
    processLogout();
  }
}

/**
 * Called every login setup.
 * Installs the login/logout button handler, updates the UI with login status.
 */
export default async function setup () {
  const uiElements = getLoginUIElements();

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
      processLogin(login);
    }
  } else {
    debug('getting user profile');

    const profile = getUserProfile();
    
    if (profile) {
      updateUI(profile, uiElements);
    }
  }
}