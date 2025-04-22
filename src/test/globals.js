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
let baseUrl = '';
let containerNetwork = null;
let mariadbContainer = null;

async function teardown () {
  debug('Teardown globals...');

  if (appContainer) {
    const tarStream = await appContainer.copyArchiveFromContainer('/home/node/app/coverage');
    const now = (new Date()).toISOString().replace(/-|:|(?:\.\d\d\dZ)/g, '');
    const today = now.replace(/T.+/, '');
    const oldDirs = await glob(`!${today}*`);
    for (const dir of oldDirs) {
      await fs.rm(dir, { recursive: true });
    }
    const cwd = `./coverage/${now}`;
    await fs.mkdir(cwd, { recursive: true });
    tarStream.pipe(tar.x({
      cwd,
      strip: 1
    })).on('finish', async () => {
      await appContainer.stop();
    });
  }
  if (authorizerContainer) {
    await authorizerContainer.stop();
  }
  if (mariadbContainer) {
    await mariadbContainer.stop();
  }
  if (containerNetwork) {
    await containerNetwork.stop();
  }

  debug('Teardown globals success');
}

export default async function setup () {
  const localhostPort = process.env.LOCALHOST_PORT;
  
  if (localhostPort) {
    debug(`LOCALHOST_PORT detected, targeting localhost:${localhostPort}...`);
    process.env.BASE_URL = `http://localhost:${localhostPort}`;
    return () => {};
  }

  debug('Setup globals...');

  ({ authorizerContainer, containerNetwork, mariadbContainer } = await createDatabaseAndAuthorizer());
  appContainer = await createAppContainer(containerNetwork, mariadbContainer, appImageName);
  baseUrl = `http://${appContainer.getHost()}:${appContainer.getMappedPort(5000)}`;
  process.env.BASE_URL = baseUrl;

  debug('Setup globals success');

  return teardown;
}