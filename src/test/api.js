/**
 * api testing utilities
 * 
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */
import { expect } from '@playwright/test';
import debugLib from 'debug';

const debug = debugLib('test-api');

export async function getData (request, url, testResponse = ()=>true) {
  debug(`GET request for ${url}...`);
  const response = await request.get(url);
  
  debug(`GET response code: ${response.status()}`);
  expect(response.ok()).toBeTruthy();

  const json = await response.json();  
  debug('GET response json: ', json);

  testResponse(expect, json);
}

export async function postData (request, url, data) {
  debug(`POST request for ${url}...`);
  const response = await request.post(url, {
    data
  });

  debug(`POST response code: ${response.status()}`);
  expect(response.ok()).toBeTruthy();

  const json = await response.json();
  debug('POST response json: ', json);

  expect(json.ok).toBeTruthy();
  expect(json).toEqual(expect.objectContaining({
    message: 'Success'
  }));
}

export async function deleteData (request, url, data) {
  debug(`DELETE request for ${url}...`);
  const response = await request.delete(url, {
    data
  });

  debug(`DELETE response code: ${response.status()}`);
  expect(response.ok()).toBeTruthy();

  const json = await response.json();
  debug('DELETE response json: ', json);

  expect(json.ok).toBeTruthy();
  expect(json).toEqual(expect.objectContaining({
    message: 'Success'
  }));
}