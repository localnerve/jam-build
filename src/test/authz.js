/**
 * Authorization helper functions.
 * 
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */
import fs from 'node:fs';
import afs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import debugLib from 'debug';

const debug = debugLib('test-authz');

/**
 * Get the CLIENT_ID of the current testcontainer instance of the authorizer.
 * 
 * @param {Page} page - The playwright.dev Page fixture
 */
export async function getAuthzClientID (page) {
  if (!process.env.AUTHZ_CLIENT_ID) {
    debug(`Navigating to ${process.env.AUTHZ_URL} ...`);

    const resp = await page.goto(`${process.env.AUTHZ_URL}`, {
      timeout: 5000
    });
    debug(`Navigation complete ${resp.status()}`);

    debug('Logging in as authorizer admin...');
    await page.locator('#admin-secret').fill(process.env.AUTHZ_ADMIN_SECRET);
    await page.locator('button[type="submit"]').click();
    debug('Pulling Client ID from dashboard...');
    const clientId = await page.locator('input[placeholder="Client ID"]').inputValue();

    debug(`Got Client ID ${clientId}`);
    process.env.AUTHZ_CLIENT_ID = clientId;

    debug('Logging out as authorizer admin...');
    await page.locator('.css-vn8yib').click();
    await page.locator('.css-13c7rae').click();
    debug('logged out admin');
  }
}

/**
 * Make the authorization user and save the .auth user role file for this worker.
 * 
 * @param {Function} expect - The playwright.dev expect function
 * @param {Object} test - The playwright.dev test object
 * @param {Object} authRef - The authorizer.dev reference
 * @param {Array} [roles] - The array of strings of the roles for the user, defaults to ['user']
 */
export async function createAuthzUser (expect, test, authRef, roles = ['user']) {
  const id = test.info().parallelIndex;
  const authDir = path.resolve(test.info().project.outputDir, '.auth');
  const mainRole = roles.length === 1 ? roles[0] : roles.includes('admin') ? 'admin' : roles[0]; // sketchy
  const fileName = path.join(`${authDir}`, `account-${mainRole}-${id}.json`);

  debug(`Checking for existence of auth file ${fileName}...`);
  if (!fs.existsSync(fileName)) {
    const username = `${mainRole}-${id}@test.local`;
    const password = `${randomBytes(4).toString('hex')}a-A#`; // password policy requirements

    debug(`authorizer signup for user ${username}...`);

    let data, errors;
    try {
      ({ data, errors } = await authRef.signup({
        email: username,
        password,
        confirm_password: password,
        roles
      }));
    } catch (err) {
      debug('Error thrown during signup');
      errors = [err];
    }

    debug('signup errors', errors);

    if (errors.length > 0 && errors[0].message.includes('already')) {
      debug(`Test user ${username} already exists in authorizer`);
    } else {
      expect(errors.length).toEqual(0);
      debug('Logging out...');
      await authRef.logout({
        Authorization: `Bearer ${data.access_token}`,
      });  
    }

    debug(`Saving user to ${fileName}...`);
    await afs.mkdir(authDir, { recursive: true });
    await afs.writeFile(fileName, JSON.stringify({
      username, password
    }));

    debug(`Successfully created user ${username}`);
  }
}

/**
 * Login to the Authorizer service and save the browser state to a file.
 *
 * @param {Function} expect - The playwright.dev expect function
 * @param {Browser} browser - The playwright.dev Browser fixture
 * @param {Object} account - An account object
 * @param {String} fileName - The full path to the file of the state file store
 */
export async function authenticateAndSaveState (expect, browser, account, fileName) {
  debug('Begin authentication, clearing storageState...');

  // Important: make sure we authenticate in a clean environment by unsetting storage state.
  const page = await browser.newPage({ storageState: undefined });

  debug(`Login to ${process.env.AUTHZ_URL}/app with account: `, account);
  await page.goto(`${process.env.AUTHZ_URL}/app`);
  await page.locator('#authorizer-login-email-or-phone-number').fill(account.username);
  await page.locator('#authorizer-login-password').fill(account.password);
  await page.locator('button[type="submit"]').click();

  debug('Login complete waiting for Logout...');
  // Wait until the page receives the cookies. If 'Logout', presumed logged in.
  const logout = await page.getByText('Logout', { exact: true });
  
  debug('Asserting authenticated state...');
  expect(logout).toBeTruthy();
  await logout.waitFor({ timeout: 1500 });
  expect(logout).toBeVisible();

  const context = page.context();
  await context.storageState({ path: fileName });
  return context;
}

/**
 * Get the username and password for the user associated with this test worker.
 * 
 * @param {Object} test - The playwright test fixture
 * @param {Number} id - The playwright parallel index that identifies the unique user
 * @param {String} [mainRole] - The unique, main role for the desired user, defaults to 'user'
 * @returns {Object} username, password of the stored user
 */
export async function acquireAccount (test, id, mainRole = 'user') {
  const fileName = path.resolve(test.info().project.outputDir, `.auth/account-${mainRole}-${id}.json`);

  debug(`Reading user info from ${fileName}...`);
  const text = await afs.readFile(fileName, { encoding: 'utf8' });
  const account = JSON.parse(text);

  debug('Successfully read user auth', account);
  return account;
}