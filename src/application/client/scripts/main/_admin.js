/**
 * Admin login script
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
import {
  processLogin,
  logout,
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
 * Handle login form 'submit' event for login.
 */
async function handleLogin (e) {
  e.preventDefault();

  if (e.target?.checkValidity()) {
    const pageSpinner = document.querySelector('.page-spinner');
    const formData = new FormData(e.target);
    const values = Object.fromEntries(formData);

    pageSpinner.classList.add('show');

    try {
      const { data, errors } = await authRef.login({
        ...values,
        roles: ['user', 'admin']
      });
      
      debug({ data, errors });

      const result = await processLogin(data, true);

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

  await logout();

  setupLogin(false);
}

function setup () {
  debug('running setup');

  authRef = initializeAuthorizer();

  loginEvents.removeEventListener('login', setupLogin);
  loginEvents.addEventListener('login', setupLogin);
  loginEvents.removeEventListener('logout', setupLogin);
  loginEvents.addEventListener('logout', setupLogin);

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
