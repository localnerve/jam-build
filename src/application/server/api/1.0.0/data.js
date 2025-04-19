/**
 * Application data interface.
 * 
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */
import express from 'express';
import mariadb from 'mariadb';
import debugLib from 'debug';

const debug = debugLib('api');

let appPool;

async function getAppValues (logger, req, res) {
  const { document, collection } = req.params;

  try {
    debug('Calling GetPropertiesForApplicationDocumentAndCollection...');

    const arr = await appPool.query(
      'CALL GetPropertiesForApplicationDocumentAndCollection(?, ?)',
      [document, collection]
    );

    debug('reducing results...');
    const results = arr[0].reduce((acc, curr) => {
      acc[curr.property_name] = curr.property_value;
      return acc;
    }, {});
    
    debug('Sending success response...');
    res.status(200).json(results);
  } catch(err) {
    [debug, logger.error.bind(logger)].forEach(f => f(`Error in getAppValues: ${err}`));
    res.status(500).json({ error: 'Internal server error'});
  }
}

async function getAppCollectionsAndValues (logger, req, res) {
  const { document } = req.params;

  try {
    debug('Calling GetPropertiesAndCollectionsForApplicationDocument...');

    const arr = await appPool.query(
      'CALL GetPropertiesAndCollectionsForApplicationDocument(?)',
      [document]
    );

    debug('reducing results...');
    const results = arr[0].reduce((acc, curr) => {
      let collection = acc[curr.collection_name];
      if (!collection) {
        collection = acc[curr.collection_name] = {};
      }
      collection[curr.property_name] = curr.property_value;
      return acc;
    }, {});

    debug('Sending success reponse...');
    res.status(200).json(results);
  } catch(err) {
    [debug, logger.error.bind(logger)].forEach(f => f(`Error in getAppCollectionsAndValues: ${err}`));
    res.status(500).json({ error: 'Internal server error'});
  }
}

async function setAppValues (logger, req, res) {
  const { document, collection, properties } = req.body;

  // TODO: Validate input
  if (!document || !collection || !Array.isArray(properties)) {
    return res.status(400).json({ error: 'Invalid input' });
  }

  try {
    debug('Calling InsertPropertiesForApplicationDocumentCollection...');

    const result = await appPool.query(
      'CALL InsertPropertiesForApplicationDocumentCollection(?, ?, ?)',
      [document, collection, JSON.stringify(properties)]
    );

    debug('Sending success response...');
    res.status(200).json({
      message: 'Success',
      ok: true,
      affectedRows: result.affectedRows,
      warningStatus: result.warningStatus
    });
  } catch (err) {
    [debug, logger.error.bind(logger)].forEach(f => f(`Error in setAppValues: ${err}`));
    res.status(500).json({ error: 'Internal server error' });
  }
}

export function create (logger) {
  if (!appPool) {
    debug('Creating db connection pool...');

    appPool = mariadb.createPool({
      host: process.env.DB_HOST,
      database: process.env.DB_DATABASE,
      user: process.env.DB_APP_USER,
      password: process.env.DB_APP_PASSWORD,
      logger: logger.info.bind(logger),
      connectionLimit: 5
    });
    process.on('SIGINT', () => {
      logger.info('Shutting down...');
      appPool.end().then(() => {
        logger.info('appPool has ended.');
        process.exit(0);
      }).catch((err) => {
        logger.error('Error ending the appPool:', err);
        process.exit(err.code || 1);
      });
    });    
    process.on('SIGTERM', () => {
      logger.info('Shutting down...');
      appPool.end().then(() => {
        logger.info('appPool has ended.');
        process.exit(0);
      }).catch((err) => {
        logger.error('Error ending the appPool:', err);
        process.exit(err.code || 1);
      });
    });
  }

  const dataRouter = express.Router();

  dataRouter.get('/:document/:collection', getAppValues.bind(null, logger));
  dataRouter.get('/:document', getAppCollectionsAndValues.bind(null, logger));
  dataRouter.post('/values', setAppValues.bind(null, logger));
  // eslint-disable-next-line no-unused-vars
  dataRouter.use((err, req, res, next) => {
    const msg = {
      type: err.type,
      message: err.message,
      status: err.status || err.statusCode || err.code || 500
    };
    debug(err);
    logger.error(msg);
    res.status(msg.status).json(msg);
  });

  return dataRouter;
}