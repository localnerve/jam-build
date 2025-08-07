/**
 * Populate the local database with a couple of dummy collections.
 * 
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */

import { test } from './fixtures.js';
import { createTestDataApp } from './testdata.js';

const baseUrl = `http://localhost:${process.env.LOCALHOST_PORT}`;

test('post local application home test data', async ({ adminRequest }) => {
  await createTestDataApp(baseUrl, adminRequest);
});