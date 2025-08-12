/**
 * Basic get and post tests that exercise a path segement on and endpoint.
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
import { test } from '#test/fixtures.js';
import { getData, postData } from './api.js';

export function basicEndpointTests (endpointPath, statusCode = 404, getNotAllowed = true) {
  return () => {
    let baseUrl;
    test.beforeAll(() => {
      baseUrl = `${process.env.BASE_URL}${endpointPath}`;
    });

    if (getNotAllowed) {
      test(`public GET ${endpointPath}`, async ({ request }) => {
        await getData(request, baseUrl, statusCode);
      });

      test(`logged in user GET ${endpointPath}`, async ({ userRequest }) => {
        const expectedStatus = /user/i.test(endpointPath) ? 404 : statusCode;
        await getData(userRequest, baseUrl, expectedStatus);
      });

      test(`logged in admin GET ${endpointPath}`, async ({ adminRequest }) => {
        const expectedStatus = /(?:app|user)/i.test(endpointPath) ? 404 : statusCode;
        await getData(adminRequest, baseUrl, expectedStatus);
      });
    }

    test(`public POST ${endpointPath}`, async ({ request }) => {
      await postData(request, baseUrl, {}, {
        expectSuccess: false,
        expectResponse: false,
        assertStatus: statusCode
      });
    });

    test(`logged in user POST ${endpointPath}`, async ({ userRequest }) => {
      const expectedStatus = /user/i.test(endpointPath) ? 404 : statusCode;
      await postData(userRequest, baseUrl, {}, {
        expectSuccess: false,
        expectResponse: false,
        assertStatus: expectedStatus
      });
    });

    test(`logged in admin POST ${endpointPath}`, async ({ adminRequest }) => {
      const expectedStatus = /(?:app|user)/i.test(endpointPath) ? 404 : statusCode;
      await postData(adminRequest, baseUrl, {}, {
        expectSuccess: false,
        expectResponse: false,
        assertStatus: expectedStatus
      });
    });
  };
}