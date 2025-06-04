/**
 * Populate the local database with a couple of dummy collections.
 */

import { test } from './fixtures.js';
import { postData } from './api/api.js';

const baseUrl = `http://localhost:${process.env.LOCALHOST_PORT}`;

test('post local application home test data', async ({ adminRequest }) => {
  return postData(adminRequest, `${baseUrl}/api/data/app/home`, {
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
});