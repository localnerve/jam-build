/**
 * The metrics service.
 * A stub for a prometheus client.
 * 
 * Jam-build, a web application practical reference.
 * Copyright (c) 2025 Alex Grant <info@localnerve.com> (https://www.localnerve.com), LocalNerve LLC
 * 
 * This file is part of Jam-build.
 * Jam-build is free software: you can redistribute it and/or modify it
 * under the terms of the GNU Affero General Public License as published by the Free Software
 * Foundation, either version 3 of the License, or (at your option) any later version.
 * Jam-build is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY;
 * without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 * See the GNU Affero General Public License for more details.
 * You should have received a copy of the GNU Affero General Public License along with Jam-build.
 * If not, see <https://www.gnu.org/licenses/>.
 * Additional terms under GNU AGPL version 3 section 7:
 * a) The reasonable legal notice of original copyright and author attribution must be preserved
 *    by including the string: "Copyright (c) 2025 Alex Grant <info@localnerve.com> (https://www.localnerve.com), LocalNerve LLC"
 *    in this material, copies, or source code of derived works.
 */
import express from 'express';
import debugLib from '@localnerve/debug';

const debug = debugLib('api:metrics');

// Stub for a prometheus client counter
const eventCounter = {
  inc (input) {
    debug('Metrics event received: ', { ...input });
  }
};

/**
 * Handler for posting event counters (stub)
 * 
 * @param {Request} req - The expressjs Request object
 * @param {Response} res - The expressjs Response object
 */
function setMetrics (req, res) {
  const { event, labels } = req.body;
  eventCounter.inc({ event, ...labels });
  res.sendStatus(204);
}

/**
 * Handler for a prometheus scrape (stub)
 * 
 * @param {Request} req - The expressjs Request object
 * @param {Response} res - The expressjs Response object
 */
function getMetrics (req, res) {
  // set content type
  // send response
  res.sendStatus(204);
}

/**
 * Creates the metrics service.
 *
 * @returns {Array<Router>} Array of middleware for this service
 */
export function createService () {
  const appRouter = express.Router();

  appRouter.post('/', setMetrics);
  appRouter.get('/', getMetrics);

  return [appRouter];
}