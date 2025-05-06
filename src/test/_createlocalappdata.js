/**
 * Populate the local database with a couple of dummy collections.
 */

import { test } from './fixtures.js';
import { postData } from './api/api.js';

const baseUrl = 'http://localhost:5000';

test('post application home state and friends', async ({ adminRequest }) => {
  return postData(adminRequest, `${baseUrl}/api/data/app/home`, {
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
    }]
  });
});