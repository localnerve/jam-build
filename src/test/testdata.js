/**
 * Functions to create and delete test app and user data.
 * 
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */
import { getData, postData, deleteData } from './api/api.js';

/**
 * Create test data for app user.
 * 
 * @param {String} url - The base url for the request
 * @param {APIRequestContext} - The logged in admin BrowserContext
 */
export async function createTestDataApp (url, adminRequest) {
  let version = 0;

  try {
    await getData(adminRequest, `${url}/api/data/app/home`, json => {
      version = json.home.__version
    });
  } catch (e) {
    console.warn('no existing app home data');
  }

  await postData(adminRequest, `${url}/api/data/app/home`, {
    version,
    collections: [{
      collection: 'state',
      properties: {
        property1: 'value1',
        property2: 'value2',
        property3: 'value3',
        property4: 'value4'
      }
    }, {
      collection: 'friends',
      properties: { 
        property1: 'value44',
        property2: 'value55',
        property3: 'value46'
      }
    }, {
      collection: 'content',
      properties: {
        intro: 'This is application level, shared dynamic content for the home page from the data service. It can be changed at any time by app admins. It can be any series of named objects and properties for any purpose, not just some text content like this. The application also provides private, per-user dynamic content with the same capabilities. Login to exercise that data flow.'
      }
    }]
  });
}

/**
 * Create test data for user user.
 * 
 * @param {String} url - The base url for the request
 * @param {APIRequestContext} - The logged in user BrowserContext
 */
export async function createTestDataUser (url, userRequest) {
  let version = 0;

  try {
    await getData(userRequest, `${url}/api/data/user/home`, json => {
      version = json.home.__version
    });
  } catch (e) {
    console.warn('no existing user home data');
  }

  await postData(userRequest, `${url}/api/data/user/home`, {
    version,
    collections: [{
      collection: 'state',
      properties: {
        property1: 'value1',
        property2: 'value2',
        property3: 'value3',
        property4: 'value4'
      }
    }, {
      collection: 'friends',
      properties: { 
        property1: 'value44',
        property2: 'value45',
        property3: 'value46'
      }
    }, {
      collection: 'content',
      properties: {
        intro: 'This is user dynamic content on the home page from the data service. It can be changed at any time by app admins or users. It can be any series of named objects and properties for any purpose, not just some text content like this. This data is only available per user after login.'
      }
    }]
  });
}

/**
 * Delete test data for the app user.
 * 
 * @param {String} url - The base url for the request
 * @param {APIRequestContext} - The logged in admin BrowserContext
 */
export async function deleteTestDataApp (url, adminRequest) {
  let version = 1;

  try {
    await getData(adminRequest, `${url}/api/data/app/home`, json => {
      version = json.home.__version
    });
  } catch (e) {
    console.warn('no existing app home data');
  }

  await deleteData(adminRequest, `${url}/api/data/app/home`, {
    version: 1,
    deleteDocument: true
  });
}

/**
 * Delete test data for the user user.
 * 
 * @param {String} url - The base url for the request
 * @param {APIRequestContext} - The logged in user BrowserContext
 */
export async function deleteTestDataUser (url, userRequest) {
  let version = 0;

  try {
    await getData(userRequest, `${url}/api/data/user/home`, json => {
      version = json.home.__version
    });
  } catch (e) {
    console.warn('no existing user home data');
  }

  await deleteData(userRequest, `${url}/api/data/user/home`, {
    version,
    deleteDocument: true
  });
}