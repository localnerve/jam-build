/**
 * api version 1.0.0
 *
 * Attach the basic routes for the services on 1.0.0
 *
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */
import express from 'express';
import { createService } from './data/index.js';

export function create (logger) {
  const api = express.Router();
 
  api.use('/data', createService(logger));

  return api;
}
