/**
 * Create a user on local instance.
 * 
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */
import { Authorizer } from '@authorizerdev/authorizer-js';
import debugLib from '@localnerve/debug';

const debug = debugLib('_createlocaluser');

const authRef = new Authorizer({
  authorizerURL: process.env.AUTHZ_URL,
  redirectURL: `http://localhost:${process.env.LOCALHOST_PORT}`,
  clientID: process.env.AUTHZ_CLIENT_ID,
});

const username = 'testguy1@test.local';
const password = 'Q1w2E#r4';

let data, errors;
try {
  ({ data, errors } = await authRef.signup({
    email: username,
    password,
    confirm_password: password,
    roles: ['user']
  }));
} catch (err) {
  errors = [err];
}

if (errors.length > 0) {
  if (errors[0].message.includes('already')) {
    debug(`Test user ${username} already exists in authorizer`);
  }
  debug('recieved errors', errors);
} else {
  debug('Logging out...');
  await authRef.logout({
    Authorization: `Bearer ${data.access_token}`,
  });  
}
