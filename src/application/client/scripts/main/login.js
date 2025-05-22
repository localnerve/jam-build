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

const authRef = new Authorizer({
  authorizerURL: process.env.AUTHZ_URL, // eslint-disable-line no-undef -- defined at bundle time
  redirectURL: window.location.origin,
  clientID: process.env.AUTHZ_CLIENT_ID // eslint-disable-line no-undef -- defined at bundle time
});

/**
 * Check the login sessionStorage value to see if the login access token is active.
 * If not, you need to login again... (unless I change this policy).
 * 
 * @returns {Boolean} true if access_token is active, false otherwise
 */
function isActive () {
  const login = JSON.parse(sessionStorage.getItem('login') || null);

  if (login) {
    const endTime = new Date(login.startTime + (login.expires_in * 1000)).getTime();
    const active = Date.now() - endTime;
    if (active < 0) {
      return true;
    }
  }

  return false;
}

/**
 * Set the UI elements from the profile.
 */
function updateUI (hdr, hdrStatusText, profile) {
  const message = `Welcome, ${profile.email}`;
  hdrStatusText.innerHTML = message;
  hdr.classList.add('logged-in');
}

/**
 * Get the user profile from sessionStorage.
 * 
 * @returns {Object} The user profile object, or null if not access_token not active
 */
function getUserProfile () {
  if (isActive()) {
    return JSON.parse(sessionStorage.getItem('user') || null);
  }
  
  sessionStorage.setItem('user', '');
  return null;
}

/**
 * Check to see if this is being called back in the PKCE login flow.
 * 
 * @returns {Boolean} true if this is actively in PKCE login flow, false otherwise
 */
function isLoggingIn () {
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
 * Called every login setup.
 * Installs the login/logout button handler, updates the UI with login status.
 */
export default async function setup () {
  const loginButton = document.querySelector('#ln-login');
  const hdr = document.querySelector('.ln-header');
  const hdrStatusText = document.querySelector('.ln-header .status p');

  // Install the login/logout handler
  loginButton.addEventListener('click', async () => {
    const loggedIn = sessionStorage.getItem('login');
    if (!loggedIn) {
      await authRef.authorize({
        response_type: 'code',
        use_refresh_token: false
      });
    } else {
      await authRef.logout();
      sessionStorage.setItem('login', '');
      hdrStatusText.innerHTML = '';
      hdr.classList.remove('logged-in');
      window.App.exec('login-action-logout');
    }
  });

  if (isLoggingIn()) {
    // Finish login
    const { data: login, errors: loginErrors } = await authRef.authorize({
      response_type: 'code',
      use_refresh_token: false
    });
    
    // Save login, profile
    if (!loginErrors.length && login?.access_token) {
      sessionStorage.setItem('login', JSON.stringify({
        startTime: Date.now(),
        expires_in: login.expires_in
      }));

      const { data: profile, errors: profileErrors } = await authRef.getProfile({
        Authorization: `Bearer ${login.access_token}`,
      });

      if (!profileErrors.length) {
        sessionStorage.setItem('user', JSON.stringify(profile));
        window.App.exec('login-action-login');
        updateUI(hdr, hdrStatusText, profile);
      }
    }
  } else {
    const profile = getUserProfile();
    if (profile) {
      updateUI(hdr, hdrStatusText, profile);
    }
  }
}