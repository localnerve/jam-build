/**
 * Populate the local database with a couple of dummy collections.
 */

import { test } from './fixtures.js';
import { deleteData } from './api/api.js';

const baseUrl = `http://localhost:${process.env.LOCALHOST_PORT}`;

test('post local user home test data', async ({ userRequest }) => {
  return deleteData(userRequest, `${baseUrl}/api/data/user/home`, {
    version: 3,
    deleteDocument: true
  });
});