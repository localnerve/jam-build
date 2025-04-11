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
import { create as createVersion100 } from './1.0.0/index.js';

export const mountpath = '/api';

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
  
  if (!options.noCompression) {
    api.use(compression());
  }

  api.use(express.json()); // for parsing application/json
  api.use(express.urlencoded({ extended: true })); // for parsing application/x-www-form-urlencoded
  api.use(versionRequest.setVersionByHeader()); // X-Api-Version: 1.0.0

  api.locals = { ...api.locals, ...locals };

  const routesMap = new Map();
  const version100 = createVersion100(logger);
  routesMap.set('default', version100);
  routesMap.set('1.0', version100);

  // add new versions here

  api.use(versionRouter.route(routesMap, { useMaxVersion: true }));

  return api;
}