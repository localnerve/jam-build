/**
 * Test fixtures.
 * 
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */
import fs from 'node:fs';
import path from 'node:path';
import { test as baseTest, expect } from '@playwright/test';
import { authenticateAndSaveState, acquireAccount } from './authz.js';

export * from '@playwright/test';

async function createStateAndUseContext (role, test, browser, use, createPage = false) {
  const id = test.info().parallelIndex;
  const fileName = path.resolve(test.info().project.outputDir, `.auth/state-${role}-${id}.json`);

  let context;
  if (!fs.existsSync(fileName)) {
    const account = await acquireAccount(test, id, role);
    context = await authenticateAndSaveState(expect, browser, account, fileName);
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

export const test = baseTest.extend({
  adminRequest: [async ({ browser }, use) => {
    return createStateAndUseContext('admin', test, browser, use);
  }, { scope: 'worker' }],

  userRequest: [async ({ browser }, use) => {
    return createStateAndUseContext('user', test, browser, use);
  }, { scope: 'worker' }],

  adminPage: [async ({ browser }, use) => {
    return createStateAndUseContext('admin', test, browser, use, true);
  }, { scope: 'worker' }],

  userPage: [async ({ browser }, use) => {
    return createStateAndUseContext('user', test, browser, use, true);
  }]
});