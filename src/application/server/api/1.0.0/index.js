/**
 * api version 1.0.0
 *
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */
import express from 'express';
import debugLib from 'debug';
import { create as createAppData } from './appData.js';

const debug = debugLib('api');

export function create (logger) {
  const api = express.Router();
 
  api.use('/data', createAppData(logger));

  return api;
}
