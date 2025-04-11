/**
 * Application data interface.
 * 
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */
import express from 'express';
import mariadb from 'mariadb';

let pool;

async function getValues (logger, req, res) {
  const { document, collection } = req.params;

  try {
    const arr = await pool.query(
      'CALL GetValuesForDocumentAndCollection(?, ?)',
      [document, collection]
    );

    const results = arr[0].reduce((acc, curr) => {
      acc[curr.value_name] = curr.value_value;
      return acc;
    }, {});
    
    res.status(200).json(results);
  } catch(err) {
    logger('Error in getValues: ', err);
    res.status(500).json({ error: 'Internal server error'});
  }
}

async function getCollectionsAndValues (logger, req, res) {
  const { document } = req.params;

  try {
    const arr = await pool.query(
      'CALL GetCollectionsAndValues(?)',
      [document]
    );

    const results = arr[0].reduce((acc, curr) => {
      let collection = acc[curr.collection_name];
      if (!collection) {
        collection = acc[curr.collection_name] = {};
      }
      collection[curr.value_name] = curr.value_value;
      return acc;
    }, {});
    logger(arr, results);
    res.status(200).json(results);
  } catch(err) {
    logger('Error in getValues: ', err);
    res.status(500).json({ error: 'Internal server error'});
  }
}

async function setValues (logger, req, res) {
  const { document, collection, values } = req.body;

  // TODO: Validate input
  if (!document || !collection || !Array.isArray(values)) {
    return res.status(400).json({ error: 'Invalid input' });
  }

  try {
    // Call the stored procedure
    const result = await pool.query(
      'CALL InsertDocumentCollectionNameValues(?, ?, ?)',
      [document, collection, JSON.stringify(values)]
    );

    res.status(200).json({
      message: 'Success',
      affectedRows: result.affectedRows,
      warningStatus: result.warningStatus
    });
  } catch (err) {
    logger('Error in setValues' , err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export function create (logger) {
  if (!pool) {
    pool = mariadb.createPool({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_DATABASE,
      logger,
      connectionLimit: 5
    });
    process.on('SIGINT', () => {
      logger('Shutting down...');
      pool.end().then(() => {
        logger('Pool has ended.');
        process.exit(0);
      }).catch((err) => {
        logger('Error ending the pool:', err);
        process.exit(err.code || 1);
      });
    });    
    process.on('SIGTERM', () => {
      logger('Shutting down...');
      pool.end().then(() => {
        logger('Pool has ended.');
        process.exit(0);
      }).catch((err) => {
        logger('Error ending the pool:', err);
        process.exit(err.code || 1);
      });
    });
  }

  const dataRouter = express.Router();

  dataRouter.get('/:document/:collection', getValues.bind(null, logger));
  dataRouter.get('/:document', getCollectionsAndValues.bind(null, logger));
  dataRouter.post('/values', setValues.bind(null, logger));

  return dataRouter;
}