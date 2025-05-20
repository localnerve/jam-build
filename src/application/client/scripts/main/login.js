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

async function getLoginState ({ hdr, hdrStatusText }) {
  const params = new URLSearchParams(window.location.search);
  const state = params.get('state'); 

  if (state) {
    let clientID;
    try {
      clientID = JSON.parse(atob(state)).clientID;
    } catch {
      console.warn('bad qs for state'); // eslint-disable-line
    }

    if (clientID) {
      const { data, errors } = await authRef.authorize({
        response_type: 'code',
        use_refresh_token: false
      });
      
      if (!errors.length && data?.access_token) {
        localStorage.setItem('login', clientID);

        const res = await authRef.getProfile({
          Authorization: `Bearer ${data.access_token}`,
        });
        
        if (!res.errors.length) {
          const message = `Welcome, ${res.data.email}`;
          hdrStatusText.innerHTML = message;
          hdr.classList.add('logged-in');
        }
      }
    }
  }
}

export default async function setup () {
  const loginButton = document.querySelector('#ln-login');
  const hdr = document.querySelector('.ln-header');
  const hdrStatusText = document.querySelector('.ln-header .status p');

  getLoginState({ hdr, hdrStatusText });

  loginButton.addEventListener('click', async () => {
    const loggedIn = localStorage.getItem('login');
    if (!loggedIn) {
      await authRef.authorize({
        response_type: 'code',
        use_refresh_token: false
      });
    } else {
      await authRef.logout();
      localStorage.setItem('login', '');
      hdrStatusText.innerHTML = '';
      hdr.classList.remove('logged-in');
      window.location.href = '/';
    }
  });
}