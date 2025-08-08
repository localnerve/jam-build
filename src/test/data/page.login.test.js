/**
 * Page login test
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
 * If not, see <https://www.gnu.org/licenses/>.
 * Additional terms under GNU AGPL version 3 section 7:
 * a) The reasonable legal notice of original copyright and author attribution must be preserved
 *    by including the string: "Copyright (c) 2025 Alex Grant <info@localnerve.com>, LocalNerve LLC"
 *    in this material, copies, or source code of derived works.
 */
import { test } from '#test/fixtures.js';
import { manualLogin, manualLogout } from '#test/login.utils.js';
import {
  createTestDataApp,
  createTestDataUser,
  deleteTestDataApp,
  deleteTestDataUser
} from '#test/testdata.js';
import { startJS, stopJS, createMap, createReport } from '#test/coverage.js';

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