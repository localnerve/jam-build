/**
 * api version 1.0.0
 *
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */
import express from 'express';
import debugLib from 'debug';
import { create as createData } from './data.js';

const debug = debugLib('api');

export function create (logger) {
  const api = express.Router();
 
  api.use('/data', createData(logger));
  // eslint-disable-next-line no-unused-vars
  api.use((err, req, res, next) => {
    const msg = {
      type: err.type,
      message: err.message,
      status: err.status || err.statusCode || err.code || 500
    };
    debug(err);
    logger.error(msg);
    res.status(msg.status).json(msg);
  });

  return api;
}
