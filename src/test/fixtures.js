/**
 * Test fixtures.
 * Supply multi-user, multi-worker, signed-in stateful Page and Request contexts for tests.
 * 
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */
import fs from 'node:fs';
import path from 'node:path';
import { test as baseTest } from '@playwright/test';
import { authenticateAndSaveState, acquireAccount } from './authz.js';

export * from '@playwright/test';

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
    const account = await acquireAccount(test, mainRole, signupRoles);
    context = await authenticateAndSaveState(browser, account, fileName);
  } else {
    context = await browser.newContext({ storageState: fileName });
  }

  if (createPage) {
    await (use(context.newPage()));
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
  }]
});