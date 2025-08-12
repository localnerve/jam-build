/**
 * The api sub application.
 * 
 * Jam-build, a web application practical reference.
 * Copyright (c) 2025 Alex Grant <info@localnerve.com> (https://www.localnerve.com), LocalNerve LLC
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
 *    by including the string: "Copyright (c) 2025 Alex Grant <info@localnerve.com> (https://www.localnerve.com), LocalNerve LLC"
 *    in this material, copies, or source code of derived works.
 */

import express from 'express';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import versionRouter from 'express-version-route';
import versionRequest from 'express-version-request';
import debugLib from '@localnerve/debug';
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
  api.use(cookieParser()); // for parsing cookies
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
      ok: false,
      timestamp: (new Date()).toISOString(),
      url: req.originalUrl
    });
  });

  // eslint-disable-next-line no-unused-vars
  api.use((err, req, res, next) => {
    const versionError = /E_VERSION/.test(err?.message);

    const msg = {
      status: (versionError && 409) || err.status || err.statusCode || 500,
      message: err.sql ? err.code : err.message,
      ok: false,
      versionError,
      timestamp: (new Date()).toISOString(),
      url: req.originalUrl,
      type: (versionError && 'version') || err.type || err.name || 'unknown'
    };
    debug(err);
    logger.error({...msg, ...{ err }});
    res.status(msg.status).json(msg);
  });

  return api;
}