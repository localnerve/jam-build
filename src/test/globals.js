/**
 * Global test references
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
import fs from 'node:fs/promises';
import * as tar from 'tar';
import { glob } from 'glob';
import debugLib from '@localnerve/debug';
import { getAuthzClientID } from './authz.js';

import {
  createAppContainer,
  createDatabaseAndAuthorizer
} from './services.js';

const debug = debugLib('test:globals');

const appImageName = 'jam-build-test';
let appContainer = null;
let authorizerContainer = null;
let containerNetwork = null;
let mariadbContainer = null;

async function shutdownAppContainer (appContainer) {
  const baseUrl = process.env.BASE_URL;

  debug('Sending shutdown request to app in appContainer...');
  const aborter = new AbortController();
  setTimeout(() => {
    aborter.abort();
    debug('Aborted, stopped waiting for app shutdown');
  }, 1500);
  const response = await fetch(`${baseUrl}/shutdown`, {
    method: 'POST',
    signal: aborter.signal
  });
  debug(`Shutdown request complete (to write coverage report). Response status: ${response.status}`);

  const nowTb = (new Date()).toISOString().replace(/-|:|(?:\.\d\d\dZ)/g, '');
  const timeBegin = nowTb.replace(/.+T/, '');
  debug(`Wait for app shutdown for coverage completion ${timeBegin}...`);
  await new Promise(resolve => setTimeout(resolve, 1000));
  const nowTe = (new Date()).toISOString().replace(/-|:|(?:\.\d\d\dZ)/g, '');
  const timeEnd = nowTe.replace(/.+T/, '');
  debug(`Wait for app shutdown complete ${timeEnd}`);

  debug('Get coverage from appContainer...');
  const tarStream = await appContainer.copyArchiveFromContainer('/home/node/app/coverage');

  debug('Cleaning old coverage reports...');
  const coverageDir = 'coverage';
  const now = (new Date()).toISOString().replace(/-|:|(?:\.\d\d\dZ)/g, '');
  const today = now.replace(/T.+/, '');

  const oldDirs = await glob(`${coverageDir}/!(${today}*)`); // just keep today's coverage reports
  for (const dir of oldDirs) {
    debug(`Removing directory ${dir}...`);
    await fs.rm(dir, { recursive: true });
  }
  
  const cwd = `./${coverageDir}/${now}`;

  debug(`Extracting coverage tar to ${cwd}...`);

  await fs.mkdir(cwd, { recursive: true });

  return new Promise((resolve, reject) => {
    try {
      tarStream.pipe(tar.x({
        cwd,
        strip: 1
      })).on('finish', async () => {
        debug(`Coverage tar extracted from appContainer to ${cwd}`);
    
        debug('Stopping appContainer...');
        const promise = appContainer.stop();
        promise.then(() => {
          debug('appContainer stopped');    
          resolve();
        });
      });
    } catch (err) {
      reject(err);
    }
  });
}

async function teardown () {
  debug('Teardown globals...');

  if (appContainer) {
    debug('Shutting down appContainer...');
    await shutdownAppContainer(appContainer);
    debug('Shutdown appContainer complete');
  }
  
  if (authorizerContainer) {
    debug('Shutting down authorizer...');
    await authorizerContainer.stop();
    debug('Shutdown authorizer complete');
  }
  if (mariadbContainer) {
    debug('Shutting down mariadb...');
    await mariadbContainer.stop();
    debug('Shutdown mariadb complete');
  }
  if (containerNetwork) {
    debug('Shutting down containerNetwork...');
    await containerNetwork.stop();
    debug('Shutdown containerNetwork complete');
  }

  debug('Teardown globals success');
}

export default async function setup () {
  const localhostPort = process.env.LOCALHOST_PORT;
  
  if (localhostPort) {
    debug(`LOCALHOST_PORT detected, targeting localhost:${localhostPort}...`);
    // process.env.AUTHZ_URL, process.env.AUTHZ_CLIENT_ID are already set
    // Authorizer and local app are already running...
    process.env.BASE_URL = `http://localhost:${localhostPort}`;
    return () => {};
  }

  debug('Setup globals...');

  ({ authorizerContainer, containerNetwork, mariadbContainer } = await createDatabaseAndAuthorizer());

  process.env.AUTHZ_URL = `http://${authorizerContainer.getHost()}:${authorizerContainer.getMappedPort(9011)}`;

  process.env.AUTHZ_CLIENT_ID = await getAuthzClientID();

  appContainer = await createAppContainer(authorizerContainer, containerNetwork, mariadbContainer, appImageName);

  process.env.BASE_URL = `http://${appContainer.getHost()}:${appContainer.getMappedPort(5000)}`;

  debug('Setup globals success', process.env.AUTHZ_URL, process.env.BASE_URL);

  return teardown;
}