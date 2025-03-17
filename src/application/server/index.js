/**
 * Main app server.
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
  staticFiles
} from './jam-lib.js';

const {
  debug,
  noCompression,
  noHeaders,
  maintenance,
  port,
  rootDir
} = processArgs();
/* eslint-disable no-console */
const logger = debug ? console.log : () => {};
const errorLogger = console.error;
/* eslint-enable no-console */

const server = express();

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
  return logger(`serving ${rootDir}, listening on port ${port}`);
});
