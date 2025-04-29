/**
 * Authorization.
 * 
 * Depends on the following ENVIRONMENT:
 *   - process.env.AUTHZ_URL
 *   - process.env.AUTHZ_CLIENT_ID
 *
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */
import debugLib from 'debug';
import { Authorizer } from '@authorizerdev/authorizer-js';
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
