/**
 * Create a user on local instance.
 */
import { Authorizer } from '@authorizerdev/authorizer-js';
import debugLib from 'debug';

const debug = debugLib('_createlocaluser');

const authRef = new Authorizer({
  authorizerURL: 'http://localhost:9010',
  redirectURL: 'http://localhost:5000',
  clientID: 'e75cf345-a9d4-48e4-a9f8-2352e95a2ae3',
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
