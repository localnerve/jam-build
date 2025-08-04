/**
 * Manual login and logout operations.
 * 
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */
import { test, expect } from './fixtures.js';
import { acquireAccount } from './authz.js';
import { makeStoreType, hashDigest } from '../application/client/scripts/main/utils.js';
import { initScriptDataUpdate, waitForDataUpdate } from './page.utils.js';

/**
 * Do a manual login using the top login button.
 */
export async function manualLogin (baseUrl, page) {
  await page.addInitScript(
    initScriptDataUpdate, [process.env.AUTHZ_URL, process.env.AUTHZ_CLIENT_ID]
  );

  await page.goto(baseUrl);

  // For debugging
  await page.addScriptTag({
    content: 'localStorage.setItem("debug", "data,request,home,login");'
  });

  let storeType = makeStoreType('app', 'public');

  // Wait for the app to setup
  let payload = await waitForDataUpdate(page, {
    storeType,
    timeout: 8000
  });
  expect(payload.storeType).toEqual(storeType);

  // Login
  let logins = await page.getByLabel('Log In').all();
  let topLogin = logins[1];

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

  const userId = await hashDigest(account.username);
  storeType = makeStoreType('user', userId);

  // Start waiting for user data
  const promiseForUser = waitForDataUpdate(page, {
    storeType,
    timeout: 8000
  });

  // Verify login state changed
  logins = await page.getByLabel('Log In').all();
  topLogin = logins[1];
  await topLogin.locator('.alt-label').waitFor({
    timeout: 5000
  });
  const logoutText = await topLogin.innerText();
  expect(logoutText).toEqual('Log Out');

  // Finish waiting for user data and verify type received
  payload = await promiseForUser;
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

  return page;
}

/**
 * Log a manual logout using the top logout button.
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