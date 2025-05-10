/**
 * The methods for get, post, and delete for the app and user data service.
 * 
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */
import debugLib from '@localnerve/debug';

const debug = debugLib('api:data');

/**
 * Transform complex input to database format, check for invalid input along the way.
 * 
 * @param {String} inputDocument - The name of the data document
 * @param {Array|Object} inputCollections - An array of collections or single colletion object
 * @param {Function} mapCollection - A mapping function for input collections to database collections
 * @returns {Array} An array of database formatted collection objects.
 */
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
      const invalidInput = !coll.collection || typeof coll.collection !== 'string'; // can have no properties for deletes, upsert
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

/**
 * Reduce SELECT row results to an object structure.
 * This method is run repeatedly in a reduce function over an array of row output.
 * This method produces the output format of the API.
 *
 * @param {Object} acc - Accumulator, initialized to {}
 * @param {Object} curr - The current row result
 * @returns {Object} structured object { document: { collection: { propName: propVal }}}
 */
function reduceDocumentResults (acc, curr) {
  let document = acc[curr.document_name];
  if (!document) {
    document = acc[curr.document_name] = {};
  }
  let collection = document[curr.collection_name];
  if (!collection) {
    collection = document[curr.collection_name] = {};
  }
  collection[curr.property_name] = curr.property_value;
  return acc;
}

/**
 * Call a 'Get' stored procedure, process and marshall the input/output.
 * Returns the http response.
 * Implementation for the following stored procedure calls:
 *   - GetPropertiesForApplicationDocumentAndCollection
 *   - GetPropertiesAndCollectionsForApplicationDocument
 *   - GetPropertiesForUserDocumentAndCollection
 *   - GetPropertiesAndCollectionsForUserDocument
 *
 * @param {ConnectionPool} pool - The database connection pool
 * @param {String} methodName - The canonical name of this method
 * @param {String} procName - The name of the stored procedure to call
 * @param {Response} res - The expressjs Response object
 * @param {Array} inputParams - The input parameters to the stored procedure
 * @param {Function} reducer - The reducer function for the stored procedure results
 * @returns {Promise<undefined>} Fulfills on success.
 */
async function getWithParams (pool, methodName, procName, res, inputParams, reducer) {
  let conn = null;
  try {
    conn = await pool.getConnection();

    const procParamArray = Array(inputParams.length).fill('?').concat('@out_param');
    const procParams = `(${procParamArray.join(', ')})`;
  
    debug(`Calling ${procName}${procParams} with ${inputParams}...`);

    const arr = await conn.query(
      `CALL ${procName}${procParams}`,
      inputParams
    );
    const [outParam] = await conn.query('SELECT @out_param AS result');
    const notFound = !!outParam.result; // 0n, 1n

    if (notFound) {
      const error = new Error(
        `[404] ${methodName}, entity not found. Input: ${inputParams}`
      );
      error.status = 404;
      error.type = methodName;
      throw error;
    }

    debug('Reducing results...');    
    const results = arr[0].reduce(reducer, {});
    const status = Object.keys(results).length > 0 ? 200 : 204;
    debug(`Sending ${status} response...`);
    res.status(status).json(results);
  } finally {
    if (conn) {
      conn.release();
    }
  }
}

/**
 * Get App or User properties by document and collection from the database, sends the response.
 * 
 * @param {ConnectionPool} pool - The database connection pool
 * @param {String} methodName - The canonical name of this method
 * @param {String} procName - The name of the stored procedure to call
 * @param {Request} req - The expressjs Request object
 * @param {Response} res - The expressjs Response object
 * @returns {Promise} resolves to null on successful completion
 */
export async function getProperties (pool, methodName, procName, req, res) {
  const { document, collection } = req.params;

  debug(`${methodName} '${document}', '${collection}'`);

  const isUser = /user/i.test(methodName);
  const inputParams = isUser ? [req.user.id, document, collection] : [document, collection];

  return getWithParams(pool, methodName, procName, res, inputParams, reduceDocumentResults);
}

/**
 * Get App or User collections and their properties from the database, sends the response.
 * 
 * @param {ConnectionPool} pool - The database connection pool
 * @param {String} methodName - The canonical name of this method
 * @param {String} procName - The name of the stored procedure to call
 * @param {Request} req - The expressjs Request object
 * @param {Response} res - The expressjs Response object
 * @returns {Promise} resolves to null on successful completion
 */
export async function getCollectionsAndProperties (pool, methodName, procName, req, res) {
  const { document } = req.params;
  let { collections: inputCollections } = req.query;

  if (!Array.isArray(inputCollections)) {
    inputCollections = [inputCollections ? `${inputCollections}` : ''];
  }
  inputCollections = Array.from(new Set(inputCollections)); // dedup
  const collections = inputCollections.join(',');

  debug(`${methodName} '${document}', collections = ${collections}`);

  const isUser = /user/i.test(methodName);
  const inputParams = isUser ? [req.user.id, document, collections] : [document, collections];

  return getWithParams(pool, methodName, procName, res, inputParams, reduceDocumentResults);
}

/**
 * Get all the documents, collections, and properties.
 * 
 * @param {ConnectionPool} pool - The database connection pool
 * @param {String} methodName - The canonical name of this method
 * @param {String} procName - The name of the stored procedure to call
 * @param {Request} req - The expressjs Request object
 * @param {Response} res - The expressjs Response object
 * @returns {Promise} resolves to null on successful completion
 */
export async function getDocumentsCollectionsAndProperties (pool, methodName, procName, req, res) {
  debug (methodName);

  const isUser = /user/i.test(methodName);
  const inputParams = isUser ? [req.user.id] : [];

  return getWithParams(pool, methodName, procName, res, inputParams, reduceDocumentResults);
}

/**
 * Upsert App or User multiple properties and collections by document name.
 * Returns the http response.
 * Implementation for the following stored procedures:
 *   - UpsertApplicationDocumentWithCollectionsAndProperties
 *   - UpsertUserDocumentWithCollectionsAndProperties
 * 
 * @param {ConnectionPool} pool - The database connection pool
 * @param {String} methodName - The canonical name of this method
 * @param {String} procName - The name of the stored procedure to call
 * @param {Request} req - The expressjs Request object
 * @param {Response} res - The expressjs Response object
 * @returns {Promise} resolves to null on successful completion
 */
export async function setProperties (pool, methodName, procName, req, res) {
  const { document } = req.params;
  const { collections } = req.body;

  debug(`${methodName} '${document}', collections: `, collections);

  const procedureCollections = transformAndValidateInput(
    document, collections, coll => ({
      collection_name: coll.collection,
      properties: coll.properties ? Object.entries(coll.properties).map(([key, value]) => ({
        property_name: key,
        property_value: value
      })) : []
    })
  );

  debug('procedureCollections', procedureCollections);

  const inputParams = [document, JSON.stringify(procedureCollections)];
  const procParamArray = Array(inputParams.length).fill('?');
  if (/user/i.test(methodName)) {
    inputParams.unshift(req.user.id);
    procParamArray.unshift('?');
  }
  const procParams = `(${procParamArray.join(', ')})`;

  debug(`Calling ${procName}${procParams} for ${document} with ${inputParams.length} params...`);

  const result = await pool.query(
    `CALL ${procName}${procParams}`,
    inputParams
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

/**
 * Deletes App or User document, collections, or properties by calling a stored procedure.
 * Returns the http response.
 * Implementation for the following stored procedures:
 *   - DeleteApplicationCollection
 *   - DeleteApplicationDocument
 *   - DeleteApplicationProperties
 *   - DeleteUserCollection
 *   - DeleteUserDocument
 *   - DeleteUserProperties
 *
 * @param {ConnectionPool} pool - The database connection pool
 * @param {String} procName - The name of the stored procedure to call
 * @param {Array} inputParams - The stored procedure input parameters
 * @param {Response} res - The expressjs Response object
 */
async function deleteWithParams (pool, procName, inputParams, res) {
  const procParamArray = Array(inputParams.length).fill('?');
  const procParams = `(${procParamArray.join(', ')})`;

  debug(`Calling ${procName}${procParams} with ${inputParams}...`);

  const result = await pool.query(
    `CALL ${procName}${procParams}`,
    inputParams
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

/**
 * Delete App or User singular document from the database.
 *
 * @param {ConnectionPool} pool - The database connection pool
 * @param {String} methodName - The canonical name of this method
 * @param {String} procName - The name of the stored procedure to call
 * @param {Request} req - The expressjs Request object
 * @param {Response} res - The expressjs Response object
 * @returns {Promise} resolves to null on successful completion
 */
async function deleteFullDocument (pool, methodName, procName, req, res) {
  const { document } = req.params;

  debug(`${methodName} '${document}'`);

  const inputParams = [document];
  if (/user/i.test(methodName)) {
    inputParams.unshift(req.user.id);
  }

  return deleteWithParams(pool, procName, inputParams, res);
}

/**
 * Delete an App or User singular collection from the database.
 * 
 * @param {ConnectionPool} pool - The database connection pool
 * @param {String} methodName - The canonical name of this method
 * @param {String} procName - The name of the stored procedure to call
 * @param {Request} req - The expressjs Request object
 * @param {Response} res - The expressjs Response object
 * @returns {Promise} resolves to null on successful completion
 */
export async function deleteCollection (pool, methodName, procName, req, res) {
  const { document, collection } = req.params;

  debug(`${methodName} '${document}', '${collection}'`);

  const inputParams = [document, collection];
  if (/user/i.test(methodName)) {
    inputParams.unshift(req.user.id);
  }

  return deleteWithParams(pool, procName, inputParams, res);
}

/**
 * Delete an App or User document, multiple collections, or multiple properties from the database.
 *
 * @param {ConnectionPool} pool - The database connection pool
 * @param {String} methodName - The canonical name of this method
 * @param {String} procName - The name of the stored procedure to call
 * @param {String} docMethodName - The canonical name of the deleteDocument method, if flagged
 * @param {String} docProcName - The name of the stored procedure to delete the document, if flagged
 * @param {Request} req - The expressjs Request object
 * @param {Response} res - The expressjs Response object
 * @returns {Promise} resolves to null on successful completion
 */
export async function deleteProperties (
  pool, methodName, procName, docMethodName, docProcName, req, res
) {
  const { document } = req.params;
  const { collections, deleteDocument } = req.body;

  debug(`${methodName} '${document}', deleteDocument: '${deleteDocument}'`, collections);

  if (deleteDocument) {
    debug('Calling deleteDocument on input flag');
    return deleteFullDocument(pool, docMethodName, docProcName, req, res);
  }

  const procedureCollections = transformAndValidateInput(
    document, collections, coll => ({
      collection_name: coll.collection,
      property_names: coll.properties ? coll.properties : []
    })
  );

  const inputParams = [document, JSON.stringify(procedureCollections)];
  if (/user/i.test(methodName)) {
    inputParams.unshift(req.user.id);
  }

  return deleteWithParams(pool, procName, inputParams, res);
}
