/**
 * api version 1.0.0
 *
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */
import express from 'express';
import { create as createData } from './data.js';

export function create (logger) {
  const api = express.Router();
 
  api.use('/data', createData(logger));

  return api;
}
