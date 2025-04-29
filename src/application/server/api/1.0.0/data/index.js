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
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */
import debugLib from 'debug';
import express from 'express';
import mariadb from 'mariadb';
import {
  getProperties,
  getCollectionsAndProperties,
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