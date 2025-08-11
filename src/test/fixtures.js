/**
 * Test fixtures.
 * Supply multi-user, multi-worker, signed-in stateful Page and Request contexts for tests.
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
import path from 'node:path';
import debugLib from '@localnerve/debug';
import { test as baseTest } from '@playwright/test';
import { authenticateAndSaveState, acquireAccount } from './authz.js';

export * from '@playwright/test';

const debug = debugLib('test:fixtures');

/**
 * Create state (and user if required), create a BrowserContext from it, use as a Page or APIRequestContext.
 *
 * @param {String} mainRole - The main role to act as for the tests
 * @param {Array<String>} signupRoles - The string array of roles to give the user at signup
 * @param {Object} test - The Playwright derived test fixture
 * @param {Object} browser - The Playwright browser fixture
 * @param {Function} use - The Playwright use function
 * @param {Boolean} createPage - True to use a state filled Page fixture, false for an APIRequestContext
 */
async function createStateAndUseContext (mainRole, signupRoles, test, browser, use, createPage = false) {
  const id = test.info().parallelIndex;
  const fileName = path.resolve(test.info().project.outputDir, `.auth/state-${mainRole}-${id}.json`);

  let context;
  if (!fs.existsSync(fileName)) {
    debug(`Sign in needed for ${fileName} to create session...`);
    const account = await acquireAccount(test, mainRole, signupRoles);
    context = await authenticateAndSaveState(browser, account, fileName);
  } else {
    debug(`Using existing ${fileName} session...`);
    context = await browser.newContext({ storageState: fileName });
  }

  if (createPage) {
    await use(await context.newPage());
  } else {
    await use(context.request);
  }
  
  await context.close();
}

/**
 * Extend the Playwright test fixture to supply admin and user fixtures per worker.
 */
export const test = baseTest.extend({
  adminRequest: [async ({ browser }, use) => {
    return createStateAndUseContext('admin', ['admin', 'user'], test, browser, use);
  }, { scope: 'worker' }],

  userRequest: [async ({ browser }, use) => {
    return createStateAndUseContext('user', ['user'], test, browser, use);
  }, { scope: 'worker' }],

  adminPage: [async ({ browser }, use) => {
    return createStateAndUseContext('admin', ['admin', 'user'], test, browser, use, true);
  }, { scope: 'worker' }],

  userPage: [async ({ browser }, use) => {
    return createStateAndUseContext('user', ['user'], test, browser, use, true);
  }, { scope: 'worker' }]
});