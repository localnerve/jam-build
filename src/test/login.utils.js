/**
 * Manual login and logout operations.
 * 
 * Jam-build, a web application practical reference.
 * Copyright (c) 2025 Alex Grant <info@localnerve.com>, LocalNerve LLC
 * 
 * This file is part of Jam-build.
 * Jam-build is free software: you can redistribute it and/or modify it
 * under the terms of the GNU Affero General Public License as published by the Free Software
 * Foundation, either version 3 of the License, or (at your option) any later version.
 * Jam-build is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY;
 * without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 * See the GNU Affero General Public License for more details.
 * You should have received a copy of the GNU Affero General Public License along with Jam-build.
 * If not, see <https://www.gnu.org/licenses/>
 */
import { test, expect } from './fixtures.js';
import { acquireAccount } from './authz.js';
import { waitForDataUpdate, startPage } from './page.utils.js';
import { hashDigest } from '#client-utils/browser.js';
import { makeStoreType } from '#client-utils/storeType.js';

/**
 * Verify a user was in fact logged in.
 * Check the data update event for the user id, check the login UI state, check the session cookie.
 *
 * @param {String} baseUrl - The origin logged into
 * @param {Page} page - The playwright.dev Page object logged in with
 * @param {Object} account - The account object logged in with
 */
async function verifyLoggedIn (baseUrl, page, account) {
  const userId = await hashDigest(account.username);
  const storeType = makeStoreType('user', userId);

  // Start waiting for user data
  const promiseForUser = waitForDataUpdate(page, {
    storeType,
    timeout: 8000
  });

  // Verify login state changed
  const logins = await page.getByLabel('Log In').all();
  const topLogin = logins[1];
  await topLogin.locator('.alt-label').waitFor({
    timeout: 5000
  });
  const logoutText = await topLogin.innerText();
  expect(logoutText).toEqual('Log Out');

  // Finish waiting for user data and verify type received
  const payload = await promiseForUser;
  expect(payload.storeType).toEqual(storeType);

  // Check the authorizer session cookie is there
  let hasCookie = false;
  const context = page.context();
  const cookies = await context.cookies(baseUrl);
  for (const cookie of cookies) {
    if (cookie.name.includes('session')) {
      expect(cookie.name).toEqual(expect.stringContaining('cookie_session'));
      expect(cookie.value).toBeTruthy();
      hasCookie = true;
    }
  }
  expect(hasCookie).toBeTruthy();
}

/**
 * Do a manual admin login.
 * 
 * @param {String} baseUrl - The origin to login to
 * @param {Page} page - The playwright.dev Page object to login with
 */
export async function manualAdminLogin (baseUrl, page) {
  await startPage(`${baseUrl}/_admin`, page);

  // Get button, ensure state
  const loginButton = page.locator('#admin-login-form [type="submit"]');
  const loginText = await loginButton.innerText();
  expect(loginText).toEqual('Admin Log In');

  // Fill admin credentials
  const account = await acquireAccount(test, 'admin');
  await page.locator('#login-email-or-phone-number').fill(account.username);
  await page.locator('#login-password').fill(account.password);

  // Go, expect redirect to /
  await loginButton.click();
  await page.waitForURL(baseUrl, {
    timeout: 5000
  });

  await verifyLoggedIn(baseUrl, page, account);
}

/**
 * Do a manual login for a user using the authorizer service via the top login button.
 * 
 * @param {String} baseUrl - The url to navigate to
 * @param {Page} page - The playwright.dev Page object
 * @returns {Page} The logged in page
 */
export async function manualLogin (baseUrl, page) {
  await startPage(baseUrl, page);

  // Login
  const logins = await page.getByLabel('Log In').all();
  const topLogin = logins[1];

  // make sure button is in the expected state
  await topLogin.locator('.label').waitFor({
    timeout: 5000
  });
  const loginText = await topLogin.innerText();
  expect(loginText).toEqual('Log In');

  // click to login
  await topLogin.click();

  // @@@ go debug it
  // await new Promise(resolve => setTimeout(resolve, 50000));
  // @@@

  await page.waitForURL(url => {
    return url.origin === process.env.AUTHZ_URL;
  }, {
    timeout: 8000
  });

  const loginButton = page.getByText('Log In');
  const inputUser = page.locator('#authorizer-login-email-or-phone-number');
  const inputPass = page.locator('#authorizer-login-password');

  const account = await acquireAccount(test, 'user');
  await inputUser.fill(account.username);
  await inputPass.fill(account.password);
  await loginButton.click();

  // Wait for auth callback
  await page.waitForURL(`${baseUrl}/?state=**`, {
    timeout: 8000
  });

  await verifyLoggedIn(baseUrl, page, account);

  return page;
}

/**
 * Log a manual logout using the top logout button.
 * 
 * @param {String} baseUrl - origin to log out from
 * @param {Page} loggedInPage - The playwright.dev Page object logged in to
 * @returns {Page} The logged out Page
 */
export async function manualLogout (baseUrl, loggedInPage) {
  const page = loggedInPage;

  let logins = await page.getByLabel('Log In').all();
  let topLogin = logins[1];
  
  await topLogin.locator('.alt-label').waitFor({
    timeout: 5000
  });

  const logoutText = await topLogin.innerText();
  expect(logoutText).toEqual('Log Out');

  // click to logout
  await topLogin.click();

  // wait for Log In
  logins = await page.getByLabel('Log In').all();
  topLogin = logins[1];

  // make sure button is in the expected state
  await topLogin.locator('.label').waitFor({
    timeout: 5000
  });
  const loginText = await topLogin.innerText();
  expect(loginText).toEqual('Log In');

  // Check the authorizer session cookie is gone
  let hasCookie = false;
  const context = page.context();
  const cookies = await context.cookies(baseUrl);
  for (const cookie of cookies) {
    if (cookie.name.includes('session')) {
      hasCookie = !!cookie.value;
    }
  }
  expect(hasCookie).toBeFalsy();

  return page;
}