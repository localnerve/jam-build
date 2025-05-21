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

function isActive () {
  const login = JSON.parse(sessionStorage.getItem('login'));

  if (login) {
    const endTime = new Date(login.startTime + (login.expires_in * 1000)).getTime();
    const active = Date.now() - endTime;
    if (active < 0) {
      return true;
    }
  }

  return false;
}

function updateUI (hdr, hdrStatusText, profile) {
  const message = `Welcome, ${profile.email}`;
  hdrStatusText.innerHTML = message;
  hdr.classList.add('logged-in');
}

function getUserProfile () {
  if (isActive()) {
    const profile = sessionStorage.getItem('user');

    if (profile) {
      return JSON.parse(profile);
    }
  } else {
    sessionStorage.setItem('user', '');
  }

  return null;
}

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
      window.location.href = '/';
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