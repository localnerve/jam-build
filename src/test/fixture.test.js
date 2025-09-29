/**
 * A check project to exercise the fixtures
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
import debugLib from '@localnerve/debug';
import { expect, test } from './fixtures.js';

const debug = debugLib('test:fixture:check');

test.describe('Fixture check', () => {
  test('Audit APIRequestContext fixtures', async ({ browser, browserName, adminRequest, userRequest, request }) => {
    debug('Browser', browserName, browser.version());

    const adminState = await adminRequest.storageState();
    const userState = await userRequest.storageState();
    const publicState = await request.storageState();

    expect(adminState.cookies.length).toBeGreaterThan(0);
    expect(userState.cookies.length).toBeGreaterThan(0);
    expect(publicState.cookies.length).toEqual(0);

    debug('Admin request state', adminState);
    debug('User request state', userState);
  });

  test('Audit Page fixtures', async({ adminPage, userPage, page }) => {
    const adminState = await adminPage.context().storageState();
    const userState = await userPage.context().storageState();
    const publicState = await page.context().storageState();

    expect(adminState.cookies.length).toBeGreaterThan(0);
    expect(userState.cookies.length).toBeGreaterThan(0);
    expect(publicState.cookies.length).toEqual(0);

    debug('Admin request state', adminState);
    debug('User request state', userState);
  });
});