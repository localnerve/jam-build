/**
 * Authorization helper functions.
 * 
 * Jam-build, a web application practical reference.
 * Copyright (c) 2025 Alex Grant <info@localnerve.com> (https://www.localnerve.com), LocalNerve LLC
 * 
 * This file is part of Jam-build.
 * Jam-build is free software: you can redistribute it and/or modify it
 * under the terms of the GNU Affero General Public License as published by the Free Software
 * Foundation, either version 3 of the License, or (at your option) any later version.
 * Jam-build is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY;
 * without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 * See the GNU Affero General Public License for more details.
 * You should have received a copy of the GNU Affero General Public License along with Jam-build.
 * If not, see <https://www.gnu.org/licenses/>.
 * Additional terms under GNU AGPL version 3 section 7:
 * a) The reasonable legal notice of original copyright and author attribution must be preserved
 *    by including the string: "Copyright (c) 2025 Alex Grant <info@localnerve.com> (https://www.localnerve.com), LocalNerve LLC"
 *    in this material, copies, or source code of derived works.
 */
import fs from 'node:fs';
import afs from 'node:fs/promises';
import path from 'node:path';
import url from 'node:url';
import { randomBytes } from 'node:crypto';
import puppeteer from 'puppeteer';
import debugLib from '@localnerve/debug';
import { Authorizer } from '@localnerve/authorizer-js';

const debug = debugLib('test:authz');
const thisDir = url.fileURLToPath(new URL('.', import.meta.url));

/**
 * Get the CLIENT_ID of the current testcontainer instance of the authorizer.
 * Depends on process.env.AUTHZ_URL being set.
 * Used globally outside of test projects so playwright fixtures cannot be used.
 *
 * @returns {String} The AUTHZ_CLIENT_ID
 */
export async function getAuthzClientID () {
  debug(`Navigating to ${process.env.AUTHZ_URL} ...`);

  let puppeteerLaunch = process.env.CI ? {
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  } : {};
  let clientId;
  let browser;

  try {
    browser = await puppeteer.launch({
      ...puppeteerLaunch,
      headless: !process.argv.includes('--headed')
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
  
    // On the admin page, there is a time period where the box is visible, but before it is populated.
    // This is a React "feature". I could hook or poll, but this setup runs once, so I don't care too much,
    // and I'd rather not be coupled to the implementation details of the Authorization service admin page.
    // So here, we just wait for a period for the page "to run".
    await new Promise(resolve => setTimeout(resolve, 250));
  
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
 * If process.env.LOCALAPP_URL is set, uses reusable store for client account storage.
 * 
 * @param {Object} test - The playwright.dev test object
 * @param {String} [mainRole] - The main usage role for the desired user, defaults to 'user'
 * @param {Array} [signupRoles] - The account creation roles at signup, if the account doesn't exist, defaults to ['user']
 * @returns {Promise<String>} full file path to the auth file for the new or existing user for this worker
 */
async function createAuthzUser (test, mainRole = 'user', signupRoles = ['user']) {
  const id = test.info().parallelIndex;
  const authDir = path.resolve(process.env.LOCALAPP_URL ? thisDir : test.info().project.outputDir, '.auth');
  const fileName = path.join(authDir, `account-${mainRole}-${id}.json`);

  debug(`Checking for existence of auth file ${fileName}...`);
  if (!fs.existsSync(fileName)) {
    debug('Creating Authorizer ref: ', process.env.AUTHZ_URL, process.env.BASE_URL, process.env.AUTHZ_CLIENT_ID);

    const authRef = new Authorizer({
      authorizerURL: process.env.AUTHZ_URL,
      redirectURL: process.env.BASE_URL,
      clientID: process.env.AUTHZ_CLIENT_ID
    });
  
    const username = `${mainRole}-${id}@test.local`;
    const password = `${randomBytes(4).toString('hex')}a-A#`; // password policy requirements

    debug('Authorizer signup for account', username, password, signupRoles);

    let data, errors;
    try {
      ({ data, errors } = await authRef.signup({
        email: username,
        password,
        confirm_password: password,
        roles: signupRoles
      }));
    } catch (err) {
      debug('Error thrown during signup');
      errors = [err];
    }

    debug('Signup errors', errors);

    if (errors.length > 0) {
      let msg = errors[0].message;
      if (errors[0].message.includes('already')) {
        msg = `Test user ${username} already exists in Authorizer`;
      }
      debug(msg);
      throw new Error(msg);
    } else {
      debug('Logging out...');
      await authRef.logout({
        Authorization: `Bearer ${data.access_token}`,
      });

      debug(`Saving user to ${fileName}...`);
      await afs.mkdir(authDir, { recursive: true });
      await afs.writeFile(fileName, JSON.stringify({
        username, password, roles: signupRoles
      }));

      debug(`Successfully created user ${username}`);
    }
  } else {
    debug(`${fileName} exists`);
  }

  return fileName;
}

/**
 * Login to the Authorizer service and save the browser state to a file.
 *
 * @param {Browser} browser - The playwright.dev Browser fixture
 * @param {Object} account - An account object
 * @param {String} fileName - The full path to the file of the state file store
 */
export async function authenticateAndSaveState (browser, account, fileName) {
  debug('Begin authentication, clearing storageState...');

  // Important: make sure we authenticate in a clean environment by unsetting storage state.
  const context = await browser.newContext({ storageState: undefined });
  const page = await context.newPage();

  // BUGFIX-START: Enable debugging and capture for playwright webkit cookie bug 😒
  const isWebkit = browser.browserType().name() === 'webkit';
  let resolvePendingSessionCookie;
  const asyncPendingSessionCookie = new Promise(res => resolvePendingSessionCookie = res);

  if (isWebkit) {
    await page.route('**/*', (route, request) => {
      route.continue();
    });
    page.on('response', async response => {
      const allHeaders = await response.allHeaders();
      const setCookieHeader = allHeaders['set-cookie'];
      if (setCookieHeader) {
        debug('RESPONSE Interception - Set-Cookie header:', setCookieHeader);
        debug('RESPONSE Interception - URL:', response.url());
      
        // Match cookie_session= followed by everything up to "; Path=" 
        // This captures the full base64 encoded value including %3D%3D at the end
        const match = setCookieHeader.match(/cookie_session=([^;]+.*?)(?=;\s*Path=)/);
        if (match) {
          const pendingSessionCookie = decodeURIComponent(match[1]);
          debug('RESPONSE Interception - Captured session cookie value', pendingSessionCookie);
          resolvePendingSessionCookie(pendingSessionCookie);
        }
      } else {
        debug('RESPONSE Interception - No Set-Cookie headers');
      }
    });
  }
  // BUGFIX-END

  debug(`Login to ${process.env.AUTHZ_URL}:${process.env.AUTHZ_CLIENT_ID} with account: `, account);
  await page.addScriptTag({
    path: 'node_modules/@localnerve/authorizer-js/lib/authorizer.min.js'
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
      throw new Error(errors[0].message, {
        cause: errors[0]
      });
    }
    return data;
  }, [process.env.AUTHZ_URL, process.env.AUTHZ_CLIENT_ID, account]);
  debug('Successful login data: ', loginData);

  // BUGFIX-START: Playwright webkit cookie bug means we have to add the cookie ourselves (even in secure contexts) bc REASONS 😒
  if (isWebkit) {
    const pendingSessionCookie = await asyncPendingSessionCookie;
    if (pendingSessionCookie) {
      debug('Webkit - Attempting to manually set captured cookie');
      
      const url = new URL(process.env.AUTHZ_URL);
      const domain = `.${url.hostname}`;
      const secure = url.protocol.match(/https/) !== null;
  
      await context.addCookies([{
        name: 'cookie_session',
        value: pendingSessionCookie,
        domain,
        path: '/',
        // expires: Math.floor(Date.now() / 1000) + (30 * 60),
        expires: -1,
        httpOnly: true,
        secure,
        sameSite: 'None'
      }]);
      
      const verifycookies = await context.cookies();
      debug('Webkit - Verification after manual add:', verifycookies.length);
    }
  }
  // BUGFIX-END

  await page.close();
  await context.storageState({ path: fileName });
  return context;
}

/**
 * Get (create if required) the user account for a role for this test worker.
 * If process.env.LOCALAPP_URL is set, uses reusable store for client account storage.
 * 
 * @param {Object} test - The playwright test fixture
 * @param {String} [mainRole] - The main usage role for the desired user, defaults to 'user'
 * @param {Array} [signupRoles] - The account creation roles at signup, if the account doesn't exist, defaults to ['user']
 * @returns {Object} username, password of the stored user
 */
export async function acquireAccount (test, mainRole = 'user', signupRoles = ['user']) {
  const fileName = await createAuthzUser(test, mainRole, signupRoles);

  debug(`Reading user info from ${fileName}...`);
  const text = await afs.readFile(fileName, { encoding: 'utf8' });
  const account = JSON.parse(text);

  debug('Successfully read user auth', account);
  return account;
}