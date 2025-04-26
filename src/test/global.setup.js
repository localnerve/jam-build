/**
 * Global setup project.
 * 
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */
import { expect, test } from '@playwright/test';
import { Authorizer } from '@authorizerdev/authorizer-js';
import {
  getAuthzClientID,
  createAuthzUser
} from './authz.js';

test('Setup Worker Accounts', async ({ page }) => {
  await getAuthzClientID(page);

  const authRef = new Authorizer({
    authorizerURL: process.env.AUTHZ_URL,
    redirectURL: process.env.BASE_URL,
    clientID: process.env.AUTHZ_CLIENT_ID
  });

  await createAuthzUser(expect, test, authRef);
  await createAuthzUser(expect, test, authRef, ['admin', 'user']);
});
