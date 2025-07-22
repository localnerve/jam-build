/**
 * Admin login script
 * 
 * Build time replacements:
 *   process.env.AUTHZ_URL - The url to the Authorizer Service
 *   process.env.AUTHZ_CLIENT_ID - The Authorizer client id
 *
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */
import {
  processLogin,
  processLogout,
  initializeAuthorizer,
  getUserProfile,
  isLoginActive,
  loginEvents
} from './login.js';
import debugLib from '@localnerve/debug';

const debug = debugLib('admin');

let authRef;

function bfCacheHandler (e) {
  if (e.persisted) {
    debug('rendering from cache');
    setupLogin();
  }
}
window.removeEventListener('pageshow', bfCacheHandler);
window.addEventListener('pageshow', bfCacheHandler);

/**
 * Setup login form.
 * Presume loggedIn, update if not loggedIn.
 * Always presumes an in-page transition, just in case. No downsides.
 *
 */
function setupLogin () {
  const loggedIn = isLoginActive();

  const form = document.querySelector('#admin-login-form');
  const prevHandler = loggedIn ? handleLogin : handleLogout;
  const nextHandler = loggedIn ? handleLogout : handleLogin;
  const classMethod = loggedIn ? 'remove' : 'add';
  const formMethod = loggedIn ? 'setAttribute' : 'removeAttribute';

  form[formMethod]('novalidate', true);
  form.classList[classMethod]('login');
  form.removeEventListener('submit', prevHandler);
  form.addEventListener('submit', nextHandler);
}

/**
 * Wrapper/event handler for logout setup
 */
function setupUIForLogout () {
  setupLogin(true);
}

/**
 * Wrapper/event handler for login setup
 */
function setupUIForLogin () {
  setupLogin(false);
}

/**
 * Handle login form 'submit' event for login.
 */
async function handleLogin (e) {
  e.preventDefault();

  if (e.target?.checkValidity()) {
    const formData = new FormData(e.target);
    const values = Object.fromEntries(formData);

    try {
      const { data, errors } = await authRef.login({
        ...values,
        roles: ['user', 'admin']
      });
      
      debug({ data, errors });

      const result = await processLogin(data);

      if (result) {
        window.location.replace('/');
      }
    } catch (error) {
      debug({ error });
      window.App.exec('pageGeneralMessage', {
        args: {
          message: error.message,
          class: 'error',
          duration: 4000
        }
      });
    }
  }
}

/**
 * Handle login form 'submit' event for logout.
 */
async function handleLogout (e) {
  e.preventDefault();

  await authRef.logout();

  processLogout();
  setupLogin(false);
}

function setup () {
  debug('running setup');

  authRef = initializeAuthorizer();

  loginEvents.removeEventListener('login', setupUIForLogout);
  loginEvents.addEventListener('login', setupUIForLogout);
  loginEvents.removeEventListener('logout', setupUIForLogin);
  loginEvents.addEventListener('logout', setupUIForLogin);

  setupLogin();

  const profile = getUserProfile();
  if (profile) {
    window.App.exec('pageGeneralMessage', {
      args: {
        message: `Currently logged in as ${profile.email}`,
        class: 'info',
        duration: 4000
      }
    });
  }
}

setup();
