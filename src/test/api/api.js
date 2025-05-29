/**
 * api testing utilities
 * 
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */
import debugLib from '@localnerve/debug';
import { expect } from '../fixtures.js';

const debug = debugLib('test:api');

export async function getData (request, url, testResponse = ()=>true, status = 200) {
  debug(`GET request for ${url}...`);

  if (typeof testResponse === 'number') {
    status = testResponse; // eslint-disable-line no-param-reassign
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
      testResponse(expect, json);
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
    debug('POST parsing response as json...');
    const json = await response.json();
    debug('POST response json: ', json);

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

  testResponse(expect, fetchResponse);
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

  debug(`DELETE response code: ${response.status()}`);
  if (expectSuccess) {
    expect(response.ok()).toBeTruthy();
  } else {
    expect(response.ok()).not.toBeTruthy();
  }

  if (assertStatus) {
    expect(response.status()).toEqual(assertStatus);
  }

  if (expectResponse) {
    debug('DELETE parsing response as json...');
    const json = await response.json();
    debug('DELETE response json: ', json);

    if (expectResponseSuccess) {
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