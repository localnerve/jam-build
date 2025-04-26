/**
 * Global test references
 * 
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */
import fs from 'node:fs/promises';
import * as tar from 'tar';
import { glob } from 'glob';
import debugLib from 'debug';

import {
  createAppContainer,
  createDatabaseAndAuthorizer
} from './services.js';

const debug = debugLib('test-globals');

const appImageName = 'jam-build-test-1';
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
    process.env.AUTHZ_URL = 'http://localhost:9010';
    process.env.BASE_URL = `http://localhost:${localhostPort}`;
    return () => {};
  }

  debug('Setup globals...');

  ({ authorizerContainer, containerNetwork, mariadbContainer } = await createDatabaseAndAuthorizer());
  appContainer = await createAppContainer(containerNetwork, mariadbContainer, appImageName);

  process.env.AUTHZ_URL = `http://${authorizerContainer.getHost()}:${authorizerContainer.getMappedPort(9011)}`;
  process.env.BASE_URL = `http://${appContainer.getHost()}:${appContainer.getMappedPort(5000)}`;

  debug('Setup globals success');

  return teardown;
}