/**
 * api version 1.0.0
 *
 * Attach the basic routes for the services on 1.0.0
 *
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */
import express from 'express';
import { create as createAppData } from './appData.js';

export function create (logger) {
  const api = express.Router();
 
  api.use('/data', createAppData(logger));

  return api;
}
