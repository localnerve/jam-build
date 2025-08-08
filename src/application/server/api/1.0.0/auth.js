/**
 * Authorization.
 * 
 * Depends on the following ENVIRONMENT:
 *   - process.env.AUTHZ_URL
 *   - process.env.AUTHZ_CLIENT_ID
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
 * If not, see <https://www.gnu.org/licenses/>.
 * Additional terms under GNU AGPL version 3 section 7:
 * a) The reasonable legal notice of original copyright and author attribution must be preserved
 *    by including the string: "Copyright (c) 2025 Alex Grant <info@localnerve.com>, LocalNerve LLC"
 *    in this material, copies, or source code of derived works.
 */
import debugLib from '@localnerve/debug';
import { Authorizer } from '@localnerve/authorizer-js';
import { ping } from './utils.js';

const debug = debugLib('api:auth');

let authRef;

/**
 * Check the request header for valid format and extract the session from cookies.
 * 
 * @param {Request} req - The expressjs Request object
 * @returns {String} The cookie_session cookie session
 */
function checkHeaderAndGetSession (req) {
  debug('Header check...', req.headers);

  try {
    const cookies = req.cookies;

    if (!cookies) {
      throw new Error('Cookies not parsed! Check cookie-parser middleware.');
    }

    const session = cookies.cookie_session;
    if (!session) {
      throw new Error('Authorizer cookie "cookie_session" not found.');
    }

    debug(`Returned session ${session}`);
    return session;
  } catch (e) {
    const error = new Error('Failed to get cookie_session', {
      cause: e
    });
    error.status = 403;
    error.type = 'data.authorization';
    throw error;
  }
}

/**
 * Validate the session for the given roles.
 * 
 * @param {Request} req - The expressjs Request object
 * @param {String} session - The session from the cookie
 * @param {Array<String>} roles - The roles to check for
 * @param {String} type - A helpful string to help track errors and debug
 * @returns {Promise<undefined>} Nothing, but sets Request.user from the session data
 */
async function validateSessionAndSetUser (req, session, roles, type) {
  debug('Validate Session for roles:', roles);

  try {
    const { data, errors } = await authRef.validateSession({
      cookie: session,
      roles
    });

    if (errors.length) {
      throw new Error(errors[0].message);
    }
    if (!data.is_valid) {
      throw new Error(`Authorizer found session for ${roles} invalid: ${data}`);
    }

    debug(`Successful session authorization for ${roles} on data:`, data);

    debug('Setting req.user from data');
    req.user = data.user;
  } catch (e) {
    const error = new Error('Invalid session', {
      cause: e
    });
    error.status = 403;
    error.type = type;
    throw error;
  }
}

/**
 * Check the Authorizer service reachability, setup the interface if not already done.
 * 
 * @param {Request} req - The expressjs Request object
 * @returns {Promise<undefined>} On completion
 */
async function initializeAuthorizer (req) {
  if (!authRef) {
    const authzUrl = new URL(process.env.AUTHZ_URL);
    const pingResult = await ping(authzUrl.hostname, authzUrl.port);
    if (pingResult <= 0) {
      throw new Error('authz ping error');
    }

    const thisHostURL = `${req.protocol}://${req.host}`;
    debug(`Initializing Authorizer: authorizerURL=${process.env.AUTHZ_URL}, clientID=${process.env.AUTHZ_CLIENT_ID}, redirectURL=${thisHostURL}`);
    authRef = new Authorizer({
      authorizerURL: process.env.AUTHZ_URL,
      redirectURL: thisHostURL,
      clientID: process.env.AUTHZ_CLIENT_ID
    });
  }
}

/**
 * Perform the authorization.
 * Conditionally initialize the Authorizer interface.
 * Check the request header structure.
 * Validate the session against the desired roles.
 * Populate the Request.user object with the session user data.
 * 
 * @param {Request} req - The expressjs Request object
 * @param {Array<String>} roles - Array of role strings to check for
 * @returns {Promise<undefined>} On completion
 */
async function auth (req, roles) {
  await initializeAuthorizer(req);

  let type = '';
  if (roles.length === 1) {
    debug(`Authorize ${roles[0]}`);
    type = `data.authorization.${roles[0]}`;
  }

  const session = checkHeaderAndGetSession(req);

  await validateSessionAndSetUser(req, session, roles, type);
}

/**
 * Authorization middleware for the 'admin' role.
 * Populates the Request.user object on success.
 *  
 * @param {Request} req - The expressjs Request object
 * @param {Response} res - The expressjs Response object, not used
 * @param {Function} next - The expressjs next function
 */
export async function authAdmin (req, res, next) {
  await auth(req, ['admin']);
  next();
}

/**
 * Authorization middleware for the 'user' role.
 * Populates the Request.user object on success.
 *  
 * @param {Request} req - The expressjs Request object
 * @param {Response} res - The expressjs Response object, not used
 * @param {Function} next - The expressjs next function
 */
export async function authUser (req, res, next) {
  await auth(req, ['user']);
  next();
}
