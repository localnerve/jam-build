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

function shutdownHandler () {
  logger.info('Shutting down...');
  appPool.end().then(() => {
    logger.info('appPool has ended.');
    process.exit(0);
  }).catch((err) => {
    logger.error('Error ending the appPool:', err);
    process.exit(err.code || 1);
  });
}

function transformAndValidateInput (inputDocument, inputCollections, mapCollection) {
  let collections = inputCollections;

  // Conform array input to an array of non-falsy things.
  // This allows input of a single object of single collection updates, in addition to an array of such.
  if (!Array.isArray(collections)) {
    collections = [collections];
  }
  collections = collections.filter(obj => obj);

  let procedureCollections;

  try {
    if (!inputDocument || collections.length <= 0) {
      const e = new Error();
      e.type = 'data.validation.input';
      throw e;
    }

    procedureCollections = collections.map(coll => {
      const invalidInput = !coll.collection || typeof coll.collection !== 'string' ||
      !coll.properties || Object.keys(coll.properties).length <= 0;
      if (invalidInput) {
        const e = new Error();
        e.type = 'data.validation.input.collections';
        throw e;
      }
      return mapCollection(coll);
    });
  } catch (err) {
    const validationError = new Error('Invalid input');
    validationError.status = 400;
    validationError.type = err.type || 'data.validation.input.escape';
    throw validationError;
  }

  return procedureCollections;
}

async function getAppProperties (logger, req, res) {
  const { document, collection } = req.params;

  debug(`getAppProperties '${document}', '${collection}'`);

  let conn = null;
  try {
    debug('Calling GetPropertiesForApplicationDocumentAndCollection...');

    conn = await appPool.getConnection();

    let status, results;
    const arr = await conn.query(
      'CALL GetPropertiesForApplicationDocumentAndCollection(?, ?, @out_param)',
      [document, collection]
    );
    const [outParam] = await conn.query('SELECT @out_param AS result');
    const notFound = !!outParam.result; // 0n, 1n

    if (!notFound) {
      debug('reducing results...');
      
      results = arr[0].reduce((acc, curr) => {
        acc[curr.property_name] = curr.property_value;
        return acc;
      }, {});

      status = Object.keys(results).length > 0 ? 200 : 204;
    } else {
      status = 404;
      const message = `[404] getAppProperties, entity not found. Document: ${document}, Collection: ${collection}`;
      results = { ok: false, message };
      logger.info(message);
    }
    
    debug(`Sending ${status} response...`);
    res.status(status).json(results);
  } finally {
    if (conn) {
      conn.release();
    }
  }
}

async function getAppCollectionsAndProperties (logger, req, res) {
  const { document } = req.params;

  debug(`getAppCollectionsAndProperties '${document}'`);

  let conn = null;
  try {
    debug('Calling GetPropertiesAndCollectionsForApplicationDocument...');

    conn = await appPool.getConnection();

    let status, results;
    const arr = await conn.query(
      'CALL GetPropertiesAndCollectionsForApplicationDocument(?, @out_param)',
      [document]
    );
    const [outParam] = await conn.query('SELECT @out_param AS result');
    const notFound = !!outParam.result; // 0n, 1n

    if (!notFound) {
      debug('reducing results...');
      results = arr[0].reduce((acc, curr) => {
        let collection = acc[curr.collection_name];
        if (!collection) {
          collection = acc[curr.collection_name] = {};
        }
        collection[curr.property_name] = curr.property_value;
        return acc;
      }, {});

      status = Object.keys(results).length > 0 ? 200 : 204;
    } else {
      status = 404;
      const message = `[404] getAppCollectionsAndProperties, entity not found. Document: ${document}`;
      results = { ok: false, message };
      logger.info(message);
    }

    debug(`Sending ${status} response...`);
    res.status(status).json(results);
  } finally {
    if (conn) {
      conn.release();
    }
  }
}

async function setAppProperties (logger, req, res) {
  const { document } = req.params;
  const { collections } = req.body;

  debug(`setAppProperties '${document}', collections: `, collections);

  const procedureCollections = transformAndValidateInput(
    document, collections, coll => ({
      collection_name: coll.collection,
      properties: Object.entries(coll.properties).map(([key, value]) => ({
        property_name: key,
        property_value: value
      }))
    })
  );

  debug(`Calling UpsertApplicationDocumentWithCollectionsAndProperties for ${document}...`);
  debug('procedureCollections', procedureCollections);

  const result = await appPool.query(
    'CALL UpsertApplicationDocumentWithCollectionsAndProperties(?, ?)',
    [document, JSON.stringify(procedureCollections)]
  );

  debug('Sending success response...');
  res.status(200).json({
    message: 'Success',
    ok: true,
    timestamp: (new Date()).toISOString(),
    affectedRows: result.affectedRows,
    warningStatus: result.warningStatus
  });
}

async function deleteAppDocument (logger, req, res) {
  const { document } = req.params;

  debug(`deleteAppDocument '${document}'`);

  debug('Calling DeleteApplicationDocument...');

  const result = await appPool.query(
    'CALL DeleteApplicationDocument(?)',
    [document]
  );

  debug('Sending success response...');
  res.status(200).json({
    message: 'Success',
    ok: true,
    timestamp: (new Date()).toISOString(),
    affectedRows: result.affectedRows,
    warningStatus: result.warningStatus
  });
}

async function deleteAppCollection (logger, req, res) {
  const { document, collection } = req.params;

  debug(`deleteAppCollection '${document}', '${collection}'`);

  debug('Calling DeleteApplicationCollection...');

  const result = await appPool.query(
    'CALL DeleteApplicationCollection(?, ?)',
    [document, collection]
  );

  debug('Sending success response...');
  res.status(200).json({
    message: 'Success',
    ok: true,
    timestamp: (new Date()).toISOString(),
    affectedRows: result.affectedRows,
    warningStatus: result.warningStatus
  });
}

async function deleteAppProperties (logger, req, res) {
  const { document } = req.params;
  const { collections, deleteDocument } = req.body;

  debug(`deleteAppProperties '${document}', deleteDocument: '${deleteDocument}'`, collections);

  if (deleteDocument) {
    debug('Calling deleteAppDocument on input flag');
    return deleteAppDocument(logger, req, res);
  }

  const procedureCollections = transformAndValidateInput(
    document, collections, coll => ({
      collection_name: coll.collection,
      property_names: coll.properties
    })
  );

  debug('Calling DeleteApplicationProperties...');

  const result = await appPool.query(
    'CALL DeleteApplicationProperties(?, ?)',
    [document, JSON.stringify(procedureCollections)]
  );

  debug('Sending success response...');
  res.status(200).json({
    message: 'Success',
    ok: true,
    timestamp: (new Date()).toISOString(),
    affectedRows: result.affectedRows,
    warningStatus: result.warningStatus
  });
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

    process.on('SIGINT', shutdownHandler);
    process.on('SIGTERM', shutdownHandler);
  }

  const dataRouter = express.Router();

  dataRouter.get('/:document/:collection', getAppProperties.bind(null, logger));
  dataRouter.delete('/:document/:collection', deleteAppCollection.bind(null, logger));
  dataRouter.get('/:document', getAppCollectionsAndProperties.bind(null, logger));
  dataRouter.post('/:document', setAppProperties.bind(null, logger));
  dataRouter.delete('/:document', deleteAppProperties.bind(null, logger));

  return dataRouter;
}