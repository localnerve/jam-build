/**
 * Authorization helper functions.
 * 
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */
import fs from 'node:fs';
import afs from 'node:fs/promises';
import path from 'node:path';
import url from 'node:url';
import { randomBytes } from 'node:crypto';
import puppeteer from 'puppeteer';
import debugLib from 'debug';

const debug = debugLib('test-authz');
const thisDir = url.fileURLToPath(new URL('.', import.meta.url));

/**
 * Get the CLIENT_ID of the current testcontainer instance of the authorizer.
 * Depends on process.env.AUTHZ_URL being set.
 *
 * @returns {String} The AUTHZ_CLIENT_ID
 */
export async function getAuthzClientID () {
  debug(`Navigating to ${process.env.AUTHZ_URL} ...`);

  let clientId;
  let browser;

  try {
    browser = await puppeteer.launch({
      headless: false
    });
    const page = await browser.newPage();
    const resp = await page.goto(`${process.env.AUTHZ_URL}`, {
      timeout: 5000
    });
    debug(`Navigation complete ${resp.status()}`);

    debug('Logging in as authorizer super admin...');
    await page.locator('#admin-secret').fill(process.env.AUTHZ_ADMIN_SECRET);
    await page.locator('button[type="submit"]').click();
    debug('Pulling Client ID from dashboard...');
    const clientIdInputBox = 'input[placeholder="Client ID"]';
    await page.waitForSelector(clientIdInputBox, {
      timeout: 1000,
      visible: true
    });
    // @@@ TODO remove:
    await new Promise(resolve => setTimeout(resolve, 250));
    // @@@
    clientId = await page.$eval(clientIdInputBox, el => el.value);

    debug(`Got Client ID ${clientId}`);

    if (!clientId) {
      throw new Error('No AUTHZ_CLIENT_ID');
    }

    debug('Logging out as authorizer admin...');
    await page.locator('.css-vn8yib').click();
    await page.locator('.css-13c7rae').click();
    await page.close();
    debug('logged out admin');
  } catch (e) {
    if (!clientId) {
      debug('[FATAL]: Failed to get AUTHZ_CLIENT_ID: ', e);
      throw e;
    } else {
      debug('Failed to complete logout but received AUTHZ_CLIENT_ID');
    }
  } finally {
    if (browser) {
      await browser.close();
    }
  }

  return clientId;
}

/**
 * Make the authorization user and save the .auth user role file for this worker.
 * If process.env.LOCALHOST_PORT is set, uses reusable store for client account storage.
 * 
 * @param {Function} expect - The playwright.dev expect function
 * @param {Object} test - The playwright.dev test object
 * @param {Object} authRef - The authorizer.dev reference
 * @param {Array} [roles] - The array of strings of the roles for the user, defaults to ['user']
 */
export async function createAuthzUser (expect, test, authRef, roles = ['user']) {
  const id = test.info().parallelIndex;
  const authDir = path.resolve(process.env.LOCALHOST_PORT ? thisDir : test.info().project.outputDir, '.auth');
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
      const msg = `Test user ${username} already exists in authorizer`;
      debug(msg);
      throw new Error(msg);
    } else {
      expect(errors.length).toEqual(0);
      
      debug('Logging out...');
      await authRef.logout({
        Authorization: `Bearer ${data.access_token}`,
      });

      debug(`Saving user to ${fileName}...`);
      await afs.mkdir(authDir, { recursive: true });
      await afs.writeFile(fileName, JSON.stringify({
        username, password, roles
      }));

      debug(`Successfully created user ${username}`);
    }
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

  debug(`Login to ${process.env.AUTHZ_URL}:${process.env.AUTHZ_CLIENT_ID} with account: `, account);
  await page.addScriptTag({
    path: 'node_modules/@authorizerdev/authorizer-js/lib/authorizer.min.js'
    // url: 'https://unpkg.com/@authorizerdev/authorizer-js/lib/authorizer.min.js'
  });
  const loginData = await page.evaluate(async ([authzUrl, authzClientId, account]) => {
    const authorizerRef = new authorizerdev.Authorizer({
      authorizerURL: authzUrl,
      redirectURL: window.location.origin,
      clientID: authzClientId
    });
    const { data, errors } = await authorizerRef.login({
      email: account.username,
      password: account.password,
      roles: account.roles
    });
    if (errors.length > 0) {
      throw new Error(errors[0]);
    }
    return data;
  }, [process.env.AUTHZ_URL, process.env.AUTHZ_CLIENT_ID, account]);
  debug(`Successful login data: `, loginData);

  const context = page.context(); // no wait
  await context.storageState({ path: fileName });
  return context;
}

/**
 * Get the username and password for the user associated with this test worker.
 * If process.env.LOCALHOST_PORT is set, uses reusable store for client account storage.
 * 
 * @param {Object} test - The playwright test fixture
 * @param {Number} id - The playwright parallel index that identifies the unique user
 * @param {String} [mainRole] - The unique, main role for the desired user, defaults to 'user'
 * @returns {Object} username, password of the stored user
 */
export async function acquireAccount (test, id, mainRole = 'user') {
  const authDir = path.resolve(process.env.LOCALHOST_PORT ? thisDir : test.info().project.outputDir, '.auth');
  const fileName = path.join(authDir, `account-${mainRole}-${id}.json`);

  debug(`Reading user info from ${fileName}...`);
  const text = await afs.readFile(fileName, { encoding: 'utf8' });
  const account = JSON.parse(text);

  debug('Successfully read user auth', account);
  return account;
}