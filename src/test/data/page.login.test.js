/**
 * Page login test
 * 
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */
import { test } from '../fixtures.js';
import { manualLogin, manualLogout } from '../login.utils.js';
import {
  createTestDataApp,
  createTestDataUser,
  deleteTestDataApp,
  deleteTestDataUser
} from '../testdata.js';
import { startJS, stopJS, createMap, createReport } from '../coverage.js';

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

  test.afterAll(async ({ adminRequest, userRequest }, testInfo) => {
    await createReport(map, testInfo);
    await deleteTestDataApp(baseUrl, adminRequest);
    await deleteTestDataUser(baseUrl, userRequest);
  });

  /* eslint-disable playwright/expect-expect */

  test('Main login flow', async ({ page }, testInfo) => {
    test.setTimeout(testInfo.timeout + 20000);
    await manualLogin(baseUrl, page);
  });

  test('Main login and logout flow', async ({ page }, testInfo) => {
    test.setTimeout(testInfo.timeout + 20000);
    await manualLogin(baseUrl, page);
    await manualLogout(baseUrl, page);
  });
});