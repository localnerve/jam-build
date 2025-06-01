/**
 * Populate the local database with a couple of dummy collections.
 */

import { test } from './fixtures.js';
import { deleteData } from './api/api.js';

const baseUrl = `http://localhost:${process.env.LOCALHOST_PORT}`;

test('post local application home test data', async ({ adminRequest }) => {
  return deleteData(adminRequest, `${baseUrl}/api/data/app/home`, {
    version: 1,
    deleteDocument: true
  });
});