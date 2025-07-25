/**
 * Page login test
 * 
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */
import { test, expect } from '../fixtures.js';
import { acquireAccount } from '../authz.js';
import { makeStoreType, hashDigest } from '../../application/client/scripts/main/utils.js';
import {
  createTestDataApp,
  createTestDataUser,
  deleteTestDataApp,
  deleteTestDataUser
} from '../testdata.js';
import { startJS, stopJS, createMap, createReport } from '../coverage.js';
import { initScriptDataUpdate, waitForDataUpdate } from './page.utils.js';

test.describe('login tests', () => {
  let baseUrl;
  let map;

  test.beforeAll(async ({ adminRequest, userRequest }) => {
    baseUrl = process.env.BASE_URL;
    map = createMap();
    await createTestDataApp(baseUrl, adminRequest);
    await createTestDataUser(baseUrl, userRequest);
  });

  test.beforeEach(async ({ page }) => {
    await startJS(page);
  });

  test.afterEach(async ({ page }) => {
    await stopJS(page, map);
  });

  // eslint-disable-next-line no-empty-pattern
  test.afterAll(async ({ adminRequest, userRequest }, testInfo) => {
    await createReport(map, testInfo);
    await deleteTestDataApp(baseUrl, adminRequest);
    await deleteTestDataUser(baseUrl, userRequest);
  });

  test('Main login flow', async ({ page }) => {
    test.setTimeout(30000);

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
    expect(loginText).toEqual('Log In'); // eslint-disable-line  playwright/prefer-web-first-assertions

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
    expect(logoutText).toEqual('Log Out'); // eslint-disable-line  playwright/prefer-web-first-assertions

    // Finish waiting for user data and verify type received
    payload = await promiseForUser;
    expect(payload.storeType).toEqual(storeType);
  });
});