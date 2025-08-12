/**
 * api testing utilities
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
import { expect } from '#test/fixtures.js';

const debug = debugLib('test:api');

export async function getData (request, url, testResponse = ()=>true, status = 200) {
  debug(`GET request for ${url}...`);

  if (typeof testResponse === 'number') {
    status = testResponse;
  }

  const response = await request.get(url);
  
  debug(`GET response code: ${response.status()}`);
  
  if (status >= 200 && status < 400) {
    expect(response.ok()).toBeTruthy();
  } else {
    expect(response.ok()).not.toBeTruthy();
  }

  if (status !== 200) {
    expect(response.status()).toEqual(status);
  }

  if (status !== 204 && response.status() !== 204) {
    debug('GET parsing response as json...');
    const json = await response.json();
    debug('GET response json: ', json);

    if (typeof testResponse === 'function') {
      testResponse(json);
    }
  }
}

export async function postData (request, url, data, {
  expectSuccess = true,
  expectResponse = true,
  assertStatus = 0,
  expectResponseSuccess = true,
  expectVersionError = false
} = {}) {
  debug(`POST request for ${url}...`);

  const response = await request.post(url, {
    data
  });

  let json;
  if (expectResponse) {
    debug('POST parsing response as json...');
    json = await response.json();
    debug('POST response json: ', json);
  }

  debug(`POST response code: ${response.status()}`);
  if (expectSuccess) {
    expect(response.ok()).toBeTruthy();
  } else {
    expect(response.ok()).not.toBeTruthy();
  }

  if (assertStatus) {
    expect(response.status()).toEqual(assertStatus);
  }
  
  if (expectResponse) {
    if (expectResponseSuccess) {
      expect(json.ok).toBeTruthy();
      expect(json).toEqual(expect.objectContaining({
        message: 'Success'
      }));
      expect(BigInt(json.newVersion)).toBeGreaterThan(0);
      return json.newVersion;
    } else {
      expect(json.ok).not.toBeTruthy();
      if (expectVersionError) {
        expect(json.versionError).toBeTruthy();
      }
    }
  }
}

export async function genericRequest (url, method, body = null, testResponse = ()=>true) {
  debug(`Fetch ${method} for ${url}...`);

  const fetchResponse = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json'
    },
    body
  });

  debug(`${method} response code : ${fetchResponse.status}`);

  testResponse(fetchResponse);
}

export async function deleteData (request, url, data, {
  expectSuccess = true,
  expectResponse = true,
  assertStatus = 0,
  expectResponseSuccess = true,
  expectVersionError = false
} = {}) {
  debug(`DELETE request for ${url}...`);

  const response = await request.delete(url, {
    data
  });

  let json;
  if (expectResponse) {
    debug(`DELETE response code: ${response.status()}`);
    json = await response.json();
    debug('DELETE response json: ', json);
  }

  if (expectSuccess) {
    expect(response.ok()).toBeTruthy();
  } else {
    expect(response.ok()).not.toBeTruthy();
  }

  if (assertStatus) {
    expect(response.status()).toEqual(assertStatus);
  }

  if (expectResponse) {
    if (expectResponseSuccess && !expectVersionError) {
      expect(json.ok).toBeTruthy();
      expect(json).toEqual(expect.objectContaining({
        message: 'Success'
      }));
      expect(BigInt(json.newVersion)).toBeGreaterThanOrEqual(0);
      return json.newVersion;
    } else {
      expect(json.ok).not.toBeTruthy();
      if (expectVersionError) {
        expect(json.versionError).toBeTruthy();
      }
    }
  }
}