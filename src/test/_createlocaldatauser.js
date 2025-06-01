/**
 * Populate the local database with a couple of dummy collections.
 */

import { test } from './fixtures.js';
import { postData } from './api/api.js';

const baseUrl = `http://localhost:${process.env.LOCALHOST_PORT}`;

test('post local user home test data', async ({ userRequest }) => {
  return postData(userRequest, `${baseUrl}/api/data/user/home`, {
    version: 0,
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
    }]
  });
});