/**
 * Library of general server functions.
 * 
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */
import { default as fs, promises as afs } from 'node:fs';
import path from 'node:path';

/**
 * Get the server startup process arguments.
 * 
 * @returns {Object} parsed process arugments.
 */
export function processArgs () {
  const port = process.argv.reduce((dflt, item) => {
    const groups = item.match(/--PORT=(?<port>\d+)/i)?.groups;
    return groups?.port || dflt;
  }, 5000);
  
  const rootDir = process.argv.reduce((dflt, item) => {
    const groups = item.match(/--ROOTDIR=(?<rootdir>[^\s]+)/i)?.groups;
    return groups?.rootdir || dflt;
  }, './dist');

  const maintenance = process.argv.reduce((dflt, item) => {
    const groups = item.match(/--MAINTENANCE=(?<maintenance>.+)/i)?.groups;
    return groups?.maintenance || dflt;
  }, false);

  const envPath = process.argv.reduce((acc, item) => {
    const groups = item.match(/--ENV-PATH=(?<envPath>[\w-/.]+)/i)?.groups;
    return groups?.envPath || acc;
  }, '');

  const noCompression = process.argv.some(item => item.match('NO-COMPRESS'));
  const noHeaders = process.argv.some(item => item.match('NO-HEADERS'));
  const debug = process.argv.some(item => item.match('DEBUG'));

  return {
    debug,
    envPath,
    maintenance,
    noCompression,
    noHeaders,
    port,
    rootDir
  };
}

/**
 * Test a path for / or /[path/]page[.html][?name=value]
 * 
 * @param {String} path - a request path
 * @returns True if page route, false otherwise
 */
function isPageRoute (path) {
  // slash or word html route with slashes (optional .html or qs)
  const route = /\/$|\/[\w/]+(?:\.html)?(?:\?.+)?$/;
  return route.test(path);
}

/**
 * Express middleware function to serve static files.
 * If no /path exists, try /path.html
 * 
 * @param {Function} logger - a function to handle logging.
 * @param {String} rootDir - root directory.
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @param {Function} next - Express next stack function
 */
export function staticFiles (logger, rootDir, req, res, next) {
  const filePath = path.resolve(rootDir, '.'+req.path);
  fs.access(filePath, err => {
    if (err) {
      fs.access(`${filePath}.html`, err => {
        if (!err) {
          let path = req.path;
          if (path[path.length - 1] === '/') {
            path = path.slice(0, -1);
          }
          req.url = `${path}.html`;
        }
        logger(req.url);
        next();
      });
    } else {
      logger(req.url);
      next();
    }
  });
}

/**
 * 503 handler.
 * Rewrite all requests to 503.
 * 
 * @param {function} logger - Logging function.
 * @param {String|Number} retryAfter - The retry after HTTP date.
 * @param {Request} req - The express request object.
 * @param {Response} res - The express response object.
 * @param {Function} next - The express next function.
 */
export function maintenanceHandler (logger, retryAfter, req, res, next) {
  if (isPageRoute(req.path)) {
    logger('503', req.url);
    req.url = '503.html';
    if (Date.parse(retryAfter) || parseInt(retryAfter)) {
      res.set('Retry-After', retryAfter);
    }
    res.status(503);
  }
  next();
}

/**
 * Set response headers.
 *
 * @param {Function} logger - The logging function.
 * @param {Response} res - Express Response object.
 * @param {String} path - The requested path.
 */
export function setHeaders (logger, res, path) {
  const noCache = {
    'Cache-Control': 'public, max-age=0, must-revalidate',
    'X-Content-Type-Options': 'nosniff'
  };
  const farCache = {
    'Cache-Control': 'public, max-age=31536000',
    'X-Content-Type-Options': 'nosniff'
  };
  const routeSet = {
    'X-Frame-Options': 'SAMEORIGIN',
    'X-XSS-Protection': '1; mode=block',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': 'frame-ancestors \'self\';'
  };

  // has a fingerprint
  const fingerprinted = /[a-z0-9]{10}\.\w+/;

  if (fingerprinted.test(path)) {
    logger('far future expires');
    res.set(farCache);
  } else {
    if (isPageRoute(path)) {
      logger('route headers set');
      res.set(routeSet);
    }
    logger('no-cache headers set', path);
    res.set(noCache);
  }
}

/**
 * 404 handler.
 * 
 * @param {Function} logger - logging function.
 * @param {String} root - The root directory.
 * @param {Request} req - The express request object.
 * @param {Response} res - The express response object.
 */
export function notFoundHandler (logger, root, req, res) {
  logger('404', req.url);
  setHeaders(logger, res, req.path);
  res.status(404).sendFile('404.html', { root });
}

/**
 * 500 handler.
 * 
 * @param {Function} logger - logging function.
 * @param {String} root - The root directory.
 * @param {Object} err - The error object.
 * @param {Request} req - The express request object.
 * @param {Response} res - The express response object.
 * @param {Function} next - The express next function.
 * @returns 
 */
export function errorHandler (logger, root, err, req, res, next) {
  logger('500', req.url, err);
  if (res.headersSent) {
    return next(err);
  }
  setHeaders(logger, res, req.path);
  res.status(500).sendFile('500.html', { root });
}

/**
 * Load a host env file into the current environment.
 *
 * @param {String} envFilePath - Path to the json host env file.
 */
export async function setHostEnv (envFilePath) {
  const jsonFile = path.resolve(envFilePath);
  try {
    const configText = await afs.readFile(jsonFile, { encoding: 'utf8' });
    const config = JSON.parse(configText); 
    for (const [key, val] of Object.entries(config)) {
      process.env[key] = val;
    }
  } catch (e) {
    console.warn(`host env "${jsonFile}" not loaded, this might be ok`, e.code); // eslint-disable-line
  }
}