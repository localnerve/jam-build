/**
 * Create a user on local instance.
 * 
 * Jam-build, a web application practical reference.
 * Copyright (c) 2025 Alex Grant <info@localnerve.com>, LocalNerve LLC
 * 
 * This file is part of Jam-build.
 * Jam-build is free software: you can redistribute it and/or modify it
 * under the terms of the GNU Affero General Public License as published by the Free Software
 * Foundation, either version 3 of the License, or (at your option) any later version.
 * Jam-build is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY;
 * without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 * See the GNU Affero General Public License for more details.
 * You should have received a copy of the GNU Affero General Public License along with Jam-build.
 * If not, see <https://www.gnu.org/licenses/>
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
