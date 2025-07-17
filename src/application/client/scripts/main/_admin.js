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
import { processLogin, initializeAuthorizer, getUserProfile } from './login.js';
import debugLib from '@localnerve/debug';

const debug = debugLib('admin');

let authRef;

/**
 * Setup login form.
 */
function setupLogin () {
  document.querySelector('#admin-login-form').addEventListener('submit', handleLogin);
}

/**
 * Handle login form 'submit' event.
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

function setup () {
  authRef = initializeAuthorizer();
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
