/**
 * Populate the local database with a couple of dummy collections.
 */

import { test } from './fixtures.js';
import { deleteData, getData } from './api/api.js';

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

  await deleteData(userRequest, `${baseUrl}/api/data/user/home`, {
    version,
    deleteDocument: true
  });
});