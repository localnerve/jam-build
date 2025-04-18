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
 *   --TEST, boolean flag, true if exists, start the app with test-only api
 *  
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */

import express from 'express';
import compression from 'compression';
import pino from 'pino';
import { mountpath as apiPath, create as createApi } from './api/index.js';
import {
  errorHandler,
  initLogger,
  maintenanceHandler,
  notFoundHandler,
  processArgs,
  setHeaders,
  staticFiles,
  setHostEnv
} from './lib.js';

const {
  debug,
  envPath,
  maintenance,
  noCompression,
  noHeaders,
  port,
  rootDir,
  test
} = processArgs();

const logger = initLogger(pino, debug);

await setHostEnv(logger, envPath);

const server = express();
server.disable('x-powered-by');

if (!noCompression) {
  server.use(compression());
}

if (test) {
  server.post('/shutdown', (req, res) => {
    res.sendStatus(200);
    process.exit(0);
  });
}

if (!maintenance) {
  server.use(apiPath, createApi(logger, { noCompression }));
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
    return logger.error(err);
  }
  return logger.info(`app serving ${rootDir}, listening on port ${port}`);
});
