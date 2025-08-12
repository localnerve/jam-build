/**
 * Main app server.
 * 
 * Arguments:
 *   --PORT=nnnn, default: 5000
 *   --ROOTDIR=/path/to/dist, default: '/dist'
 *   --ENV-PATH=/path/to/host-env/file.json, default: '', optional host environment variables
 *   --MAINTENANCE='HTTP-Date'|seconds, default: false, starts the app in maintenance mode, value for RETRY_AFTER header
 *   --NO-COMPRESS, boolean flag, true if exists, starts the app without wire compression
 *   --NO-HEADERS, boolean flag, true if exists, starts the app without asset file headers
 *   --DEBUG, boolean flag, true if exists, starts the app with verbose logging
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
 *   by including the string: "Copyright (c) 2025 Alex Grant <info@localnerve.com> (https://www.localnerve.com), LocalNerve LLC"
 *   in this material, copies, or source code of derived works.
 */

import express from 'express';
import compression from 'compression';
import {
  errorHandler,
  maintenanceHandler,
  notFoundHandler,
  processArgs,
  setHeaders,
  staticFiles,
  setHostEnv
} from './jam-lib.js';

const {
  debug,
  noCompression,
  noHeaders,
  maintenance,
  port,
  rootDir,
  envPath
} = processArgs();
/* eslint-disable no-console */
const logger = debug ? console.log : () => {};
const errorLogger = console.error;
/* eslint-enable no-console */

await setHostEnv(envPath);

const server = express();
server.disable('x-powered-by');

if (!noCompression) {
  server.use(compression());
}

if (!maintenance) {
  //server.use(express.json()); // for parsing application/json
  //server.use(express.urlencoded({ extended: true })); // for parsing application/x-www-form-urlencoded
  //
  // >> use api here <<
  //
  server.use(staticFiles.bind(null, logger, rootDir));
} else {
  server.use(maintenanceHandler.bind(null, logger, maintenance));
}

server.use(express.static(rootDir, {
  index: 'home.html',
  setHeaders: noHeaders ? () => {} : setHeaders.bind(null, logger)
}));
server.use(notFoundHandler.bind(null, logger, rootDir));
server.use(errorHandler.bind(null, logger, rootDir));

server.listen(port, err => {
  if (err) {
    return errorLogger(err);
  }
  return console.log(`app serving ${rootDir}, listening on port ${port}`); // eslint-disable-line
});
