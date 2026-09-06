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
import debugLib from '@localnerve/debug';
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
  // build-only runs (FORCE_BUILD, e.g. `npm run test:build[:prod]`) start the
  // app just to prove the image boots — no tests ran, so there is no coverage
  // to flush or extract, and BASE_URL may be an endpoint that cannot route to
  // this container from this host (a bare host has no Caddy for it). Stop the
  // container directly.
  if (process.env.FORCE_BUILD) {
    debug('FORCE_BUILD set — build-only run: stopping appContainer without coverage extraction...');
    await appContainer.stop();
    return;
  }

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

  const oldDirs = await fs.glob(`${coverageDir}/!(${today}*)`); // just keep today's coverage reports
  for await (const dir of oldDirs) {
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

// Resolve the endpoints browsers will reach (AUTHZ_URL, BASE_URL).
// In prod test mode both must already be set (by the test:env:prod script or
// the environment) BEFORE the app image is built — AUTHZ_URL is baked into
// the client bundle and CSP at build time, the same contract as real
// deployments (Dockerfile ARG AUTHZ_URL). There is no endpoint-less prod
// image. The devcontainer defaults live in test:env:prod, kept aligned with
// the project Caddyfile; other hosts override with their own TLS proxy URLs.
function resolveUrls (prodTestBuild) {
  if (prodTestBuild) {
    const authzUrl = process.env.AUTHZ_URL;
    const baseUrl = process.env.BASE_URL;

    if (!authzUrl || !baseUrl) {
      throw new Error(
        'TEST_BUILD=prod requires AUTHZ_URL and BASE_URL — https URLs of the TLS proxy in front of the containers (set by test:env:prod, override for non-devcontainer hosts).'
      );
    }

    if (!authzUrl.startsWith('https:') || !baseUrl.startsWith('https:')) {
      throw new Error(
        'TEST_BUILD=prod requires TLS endpoints — AUTHZ_URL and BASE_URL must be https:// URLs'
      );
    }

    return { authzUrl, baseUrl };
  }

  // In devcontainer, Caddy provides real HTTPS via DuckDNS —
  // use the public hostnames so all browser engines get a trusted cert
  // and secure-context APIs (Service Worker, cookies) work correctly.
  // On host/GHA, use the direct container host:port (no Caddy).
  if (process.env.DEVCONTAINER) {
    return {
      authzUrl: 'https://rp-localnerve.duckdns.org',   // Keep aligned with local Caddyfile
      baseUrl: 'https://ln.rp-localnerve.duckdns.org'  // Keep aligned with local Caddyfile
    };
  }

  return null;
}

export default async function setup () {
  const localAppUrl = process.env.LOCALAPP_URL;
  
  if (localAppUrl) {
    debug(`LOCALAPP_URL detected, targeting ${localAppUrl}...`);
    // process.env.AUTHZ_URL, process.env.AUTHZ_CLIENT_ID are already set
    // Authorizer and local app are already running...
    process.env.BASE_URL = localAppUrl;

    return () => {};
  }

  const prodTestBuild = process.env.TEST_BUILD === 'prod';
  const urls = resolveUrls(prodTestBuild);

  if (urls) {
    process.env.AUTHZ_URL = urls.authzUrl;
    process.env.BASE_URL = urls.baseUrl;
  }

  const startTime = (new Date()).toISOString();
  debug('Setup globals, start: ', startTime);

  ({ authorizerContainer, containerNetwork, mariadbContainer } = await createDatabaseAndAuthorizer());

  appContainer = await createAppContainer(authorizerContainer, containerNetwork, mariadbContainer, prodTestBuild ? 'jam-build-test-prod' : appImageName);

  // If the urls were not already derived, assign them now from the docker network setup.
  // In a dev mode outside a devcontainer: direct container host:port (no Caddy or other support)
  if (!urls) {
    process.env.AUTHZ_URL = `http://${authorizerContainer.getHost()}:${authorizerContainer.getMappedPort(9011)}`;
    process.env.BASE_URL = `http://${appContainer.getHost()}:${appContainer.getMappedPort(5000)}`;
  }

  debug('Setup globals success', process.env.AUTHZ_URL, process.env.BASE_URL);

  const endTime = (new Date()).toISOString();
  const runTime = (new Date(endTime)).getTime() - (new Date(startTime)).getTime();
  const runMinutesAll = runTime / (1000 * 60);
  const runMinutes = Math.trunc(runMinutesAll);
  const runSeconds = ((runMinutesAll - runMinutes) * 60).toFixed(2);
  debug('Setup globals, end: ', endTime);
  debug(`Total run time ${runMinutes} minutes, ${runSeconds} seconds`);

  return teardown;
}