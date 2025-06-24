/**
 * Populate the local database with a couple of dummy collections.
 */

import { test } from './fixtures.js';
import { deleteData, getData } from './api/api.js';

const baseUrl = `http://localhost:${process.env.LOCALHOST_PORT}`;

test('post local application home test data', async ({ adminRequest }) => {
  let version = 1;

  try {
    await getData(adminRequest, `${baseUrl}/api/data/app/home`, json => {
      version = json.home.__version
    });
  } catch (e) {
    console.warn('no existing app home data');
  }

  await deleteData(adminRequest, `${baseUrl}/api/data/app/home`, {
    version: 1,
    deleteDocument: true
  });
});