/**
 * Functions to create and delete test app and user data.
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
    // console.warn('get - no existing app home data');
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
    // console.warn('get - no existing user home data');
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

    await deleteData(adminRequest, `${url}/api/data/app/home`, {
      version,
      deleteDocument: true
    });
  } catch (e) {
    console.warn('delete - no existing app home data');
  }
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

    await deleteData(userRequest, `${url}/api/data/user/home`, {
      version,
      deleteDocument: true
    });
  } catch (e) {
    console.warn('delete - no existing user home data');
  }
}