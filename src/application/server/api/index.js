/**
 * The api sub application.
 * 
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */

import express from 'express';
import compression from 'compression';
import versionRouter from 'express-version-route';
import versionRequest from 'express-version-request';
import debugLib from 'debug';
import { create as createVersion100 } from './1.0.0/index.js';

export const mountpath = '/api';

const debug = debugLib('api');

/**
 * Create the api sub applicaton.
 * 
 * @param {Function} logger - The logger function
 * @param {Object} options - The api options
 * @param {Object} locals - global api variables
 * @returns {Function} The express sub application
 */
export function create (logger, options = {}, locals = {}) {
  const api = express();
  api.disable('x-powered-by');

  if (!options.noCompression) {
    api.use(compression());
  }

  api.use(express.json()); // for parsing application/json
  api.use(express.urlencoded({ extended: true })); // for parsing application/x-www-form-urlencoded
  api.use(versionRequest.setVersionByHeader()); // X-Api-Version: 1.0.0

  api.locals = { ...api.locals, ...locals };

  const routesMap = new Map();
  const version100 = createVersion100(logger);
  // create other supported versions here

  routesMap.set('default', version100);
  routesMap.set('1.0', version100);
  // add other supported versions here

  api.use(versionRouter.route(routesMap, { useMaxVersion: true }));

  api.use((req, res) => {
    const status = 404;
    const message = `[${status}] Resource Not Found`;
    debug(`${message}: ${req.originalUrl}`);
    logger.info(`${message}: ${req.originalUrl}`);
    res.status(status).json({
      status,
      message,
      timestamp: (new Date()).toISOString(),
      url: req.originalUrl
    });
  });

  // eslint-disable-next-line no-unused-vars
  api.use((err, req, res, next) => {
    const msg = {
      status: err.status || err.statusCode || 500,
      message: err.sql ? err.code : err.message,
      timestamp: (new Date()).toISOString(),
      type: err.type || err.name || 'unknown'
    };
    debug(err);
    logger.error(msg);
    res.status(msg.status).json(msg);
  });

  return api;
}