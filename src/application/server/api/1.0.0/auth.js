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

async function auth (roles, req) {
  await initializeAuthorizer(req);

  let type = '';
  if (roles.length === 1) {
    debug(`Authorize ${roles[0]}`);
    type = `data.authorization.${roles[0]}`;
  }

  const session = checkHeaderAndGetSession(req);

  await validateSessionAndSetUser(req, session, roles, type);
}

export async function authAdmin (req, res, next) {
  await auth(['admin'], req);
  next();
}

export async function authUser (req, res, next) {
  await auth(['user'], req);
  next();
}
