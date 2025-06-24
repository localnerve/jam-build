/**
 * Populate the local database with a couple of dummy collections.
 */

import { test } from './fixtures.js';
import { getData, postData } from './api/api.js';

const baseUrl = `http://localhost:${process.env.LOCALHOST_PORT}`;

test('post local user home test data', async ({ userRequest }) => {
  let version = 0;

  try {
    await getData(userRequest, `${baseUrl}/api/data/user/home`, json => {
      version = json.home.__version
    });
  } catch (e) {
    console.warn('no existing user home data');
  }

  await postData(userRequest, `${baseUrl}/api/data/user/home`, {
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
});