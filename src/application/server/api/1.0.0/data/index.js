/**
 * The data service.
 * 
 * Depends on the following ENVIRONMENT:
 *   - DB_HOST
 *   - DB_DATABASE
 *   - DB_APP_USER
 *   - DB_APP_PASSWORD
 *   - DB_APP_CONNECTION_LIMIT
 *   - DB_USER
 *   - DB_PASSWORD
 *   - DB_CONNECTION_LIMIT
 *
 * Jam-build, a web application practical reference.
 * Copyright (c) 2025 Alex Grant <info@localnerve.com>, LocalNerve LLC
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
 *    by including the string: "Copyright (c) 2025 Alex Grant <info@localnerve.com>, LocalNerve LLC"
 *    in this material, copies, or source code of derived works.
 */
import debugLib from '@localnerve/debug';
import express from 'express';
import mariadb from 'mariadb';
import {
  getProperties,
  getCollectionsAndProperties,
  getDocumentsCollectionsAndProperties,
  setProperties,
  deleteCollection,
  deleteProperties
} from './methods.js';
import { authAdmin, authUser } from '../auth.js';

const debug = debugLib('api:data');

/**
 * Signal handler for process exit to gracefully end connection pools.
 * 
 * @param {Object} logger - The application level logger
 * @param {ConnectionPool} pool - The connection pool to end
 * @param {String} poolName - The name of this connection pool
 */
function shutdownHandler (logger, pool, poolName) {
  logger.info('Shutting down...');
  pool.end().then(() => {
    logger.info(`${poolName} has ended.`);
    process.exit(0);
  }).catch((err) => {
    logger.error(`Error ending ${poolName}`, err);
    process.exit(err.code || 1);
  });
}

let appPool, appRouter, userPool, userRouter;
/**
 * Creates the connection pools and middleware for the data service.
 * 
 * @param {Object} logger - The application level logger
 * @returns {Array<Router>} Array of middleware for this service
 */
export function createService (logger) {
  if (!appPool) {
    debug('Creating app db connection pool and router...');

    appPool = mariadb.createPool({
      host: process.env.DB_HOST,
      database: process.env.DB_DATABASE,
      user: process.env.DB_APP_USER,
      password: process.env.DB_APP_PASSWORD,
      logger: logger.info.bind(logger),
      connectionLimit: process.env.DB_APP_CONNECTION_LIMIT || 5
    });

    process.on('SIGINT', shutdownHandler.bind(null, logger, appPool, 'appPool'));
    process.on('SIGTERM', shutdownHandler.bind(null, logger, appPool, 'appPool'));

    appRouter = express.Router();

    // Public routes
    appRouter.get(
      '/app/:document/:collection',
      getProperties.bind(
        null,
        appPool,
        'getAppProperties',
        'GetPropertiesForApplicationDocumentAndCollection'
      )
    );
    appRouter.get(
      '/app/:document',
      getCollectionsAndProperties.bind(
        null,
        appPool,
        'getAppCollectionsAndProperties',
        'GetPropertiesAndCollectionsForApplicationDocument'
      )
    );
    appRouter.get(
      '/app',
      getDocumentsCollectionsAndProperties.bind(
        null,
        appPool,
        'getAppDocumentsCollectionsAndProperties',
        'GetPropertiesAndCollectionsAndDocumentsForApplication'
      )
    );
  
    // Require 'admin' role
    appRouter.use('/app', authAdmin);
    appRouter.delete(
      '/app/:document/:collection',
      deleteCollection.bind(
        null,
        appPool,
        'deleteAppCollection',
        'DeleteApplicationCollection'
      )
    );
    appRouter.delete(
      '/app/:document',
      deleteProperties.bind(
        null,
        appPool,
        'deleteAppProperties',
        'DeleteApplicationProperties',
        'deleteAppDocument',
        'DeleteApplicationDocument'
      )
    );
    appRouter.post(
      '/app/:document',
      setProperties.bind(
        null,
        appPool,
        'setAppProperties',
        'UpsertApplicationDocumentWithCollectionsAndProperties'
      )
    );
  }

  if (!userPool) {
    debug('Creating user db connection pool and router...');

    userPool = mariadb.createPool({
      host: process.env.DB_HOST,
      database: process.env.DB_DATABASE,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      logger: logger.info.bind(logger),
      connectionLimit: process.env.DB_CONNECTION_LIMIT || 5
    });

    process.on('SIGINT', shutdownHandler.bind(null, logger, userPool, 'userPool'));
    process.on('SIGTERM', shutdownHandler.bind(null, logger, userPool, 'userPool'));

    userRouter = express.Router();

    // All routes require 'user' role
    userRouter.use('/user', authUser);
    userRouter.get(
      '/user/:document/:collection',
      getProperties.bind(
        null,
        userPool,
        'getUserProperties',
        'GetPropertiesForUserDocumentAndCollection'
      )
    );
    userRouter.get(
      '/user/:document',
      getCollectionsAndProperties.bind(
        null,
        userPool,
        'getUserCollectionsAndProperties',
        'GetPropertiesAndCollectionsForUserDocument'
      )
    );
    userRouter.get(
      '/user',
      getDocumentsCollectionsAndProperties.bind(
        null,
        userPool,
        'getUserDocumentsCollectionsAndProperties',
        'GetPropertiesAndCollectionsAndDocumentsForUser'
      )
    );
    userRouter.delete(
      '/user/:document/:collection',
      deleteCollection.bind(
        null,
        userPool,
        'deleteUserCollection',
        'DeleteUserCollection'
      )
    );
    userRouter.delete(
      '/user/:document',
      deleteProperties.bind(
        null,
        userPool,
        'deleteUserProperties',
        'DeleteUserProperties',
        'deleteUserDocument',
        'DeleteUserDocument'
      )
    );
    userRouter.post(
      '/user/:document',
      setProperties.bind(
        null,
        userPool,
        'setUserProperties',
        'UpsertUserDocumentWithCollectionsAndProperties',
      )
    );
  }

  return [appRouter, userRouter];
}