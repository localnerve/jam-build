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
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
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

setHostEnv(envPath);
server.listen(port, err => {
  if (err) {
    return errorLogger(err);
  }
  return console.log(`app serving ${rootDir}, listening on port ${port}`); // eslint-disable-line
});
