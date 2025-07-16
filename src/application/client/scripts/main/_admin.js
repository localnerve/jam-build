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
import { Authorizer } from '@localnerve/authorizer-js';
import debugLib from '@localnerve/debug';

const debug = debugLib('admin');

let authRef;

function initializeAuthorizer () {
  authRef = new Authorizer({
    authorizerURL: process.env.AUTHZ_URL, // eslint-disable-line no-undef -- assigned at bundle time
    redirectURL: window.location.origin,
    clientID: process.env.AUTHZ_CLIENT_ID, // eslint-disable-line no-undef -- assigned at bundle time
  });
}

initializeAuthorizer();

/**
 * This is referenced in the hbs template directly to handle the submit event.
 */
async function handleLogin (e) {
  e.preventDefault();

  const formData = new FormData(e.target);
  const values = Object.fromEntries(formData);

  try {
    const { data, errors } = await authRef.login({
      ...values,
      roles: ['user', 'admin']
    });
    debug({ data, errors });
    window.location.replace('/');
  } catch (error) {
    debug({ error });
  }
}

// hook up form submit on the only form
document.querySelector('form').addEventListener('submit', handleLogin);