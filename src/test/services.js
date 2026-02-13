/**
 * Setup the services of the app.
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
import path from 'node:path';
import url from 'node:url';
import os from 'node:os';
import fs from 'node:fs/promises';
import { GenericContainer, Network, Wait, getContainerRuntimeClient, PullPolicy } from 'testcontainers';
import mariadb from 'mariadb';
import { MariaDbContainer } from '@testcontainers/mariadb';
import debugLib from '@localnerve/debug';

const thisDir = url.fileURLToPath(new URL('.', import.meta.url));
const toRoot = '../..';
const debug = debugLib('test:services');

/*
async function deleteImageByName (imageName) {
  const dockerode = (await getContainerRuntimeClient()).container.dockerode;
  await dockerode.getImage(imageName).remove();
}
*/

async function checkImageExists(imageName) {
  const dockerode = (await getContainerRuntimeClient()).container.dockerode;
  try {
    await dockerode.getImage(imageName.toString()).inspect();
    debug(`${imageName} exists.`);
    return true;
  } catch (err) {
    debug(`${imageName} does NOT exist.`, err);
    return false;
  }
}

/**
 * Clean up dangling builder stage images from multi-stage builds.
 * The TestContainers reaper cannot track intermediate build stages,
 * so we need to manually clean them up.
 */
async function cleanupBuilderImages() {
  const dockerode = (await getContainerRuntimeClient()).container.dockerode;
  try {
    debug('Cleaning up dangling builder stage images...');
    const images = await dockerode.listImages({
      filters: { dangling: ['true'] }
    });

    for (const image of images) {
      try {
        debug(`Removing dangling image ${image.Id}...`);
        await dockerode.getImage(image.Id).remove({ force: false });
      } catch (err) {
        debug(`Could not remove image ${image.Id}:`, err.message);
      }
    }
    debug('Builder image cleanup complete.');
  } catch (err) {
    debug('Error during builder image cleanup:', err.message);
  }
}

export async function createAppContainer(authorizerContainer, containerNetwork, mariadbContainer, appImageName) {
  const forceAppBuild = !!(process.env.FORCE_BUILD);

  debug(`Checking ${appImageName}... FORCE_BUILD=${forceAppBuild}`);

  let appContainerImage;
  if (await checkImageExists(appImageName) && !forceAppBuild) {
    debug(`Using image ${appImageName} without building...`);
    appContainerImage = new GenericContainer(appImageName);
  } else {
    const userInfo = os.userInfo();
    debug(`Building image ${appImageName}`, userInfo, os.arch(), process.env.AUTHZ_URL, process.env.AUTHZ_CLIENT_ID);

    appContainerImage = await GenericContainer.fromDockerfile(path.resolve(thisDir, toRoot), 'Dockerfile')
      .withBuildArgs({
        UID: `${userInfo.uid}`,
        GID: `${userInfo.gid}`,
        TARGETARCH: `${os.arch()}`,
        DEV_BUILD: '1',
        // AUTHZ_URL: `http://${authorizerContainer.getIpAddress(containerNetwork.getName())}:9011`,
        AUTHZ_URL: process.env.AUTHZ_URL,
        AUTHZ_CLIENT_ID: process.env.AUTHZ_CLIENT_ID
      })
      .withTarget('runtime-dev')
      .withCache(true)
      .build(appImageName, {
        deleteOnExit: false
      });

    // Clean up dangling builder stage images that the reaper cannot track
    await cleanupBuilderImages();
  }

  debug(`Starting ${appImageName}...`);

  const appContainer = await appContainerImage
    .withName('jam-build')
    .withNetwork(containerNetwork)
    .withExposedPorts(5000)
    .withEntrypoint(['npm', 'run', 'dev:cover'])
    .withPullPolicy(PullPolicy.defaultPolicy())
    .withEnvironment({
      DB_DATABASE: process.env.DB_DATABASE,
      DB_HOST: mariadbContainer.getIpAddress(containerNetwork.getName()),
      DB_USER: process.env.DB_USER,
      DB_PASSWORD: process.env.DB_PASSWORD,
      DB_APP_USER: process.env.DB_APP_USER,
      DB_APP_PASSWORD: process.env.DB_APP_PASSWORD,
      AUTHZ_URL: `http://${authorizerContainer.getIpAddress(containerNetwork.getName())}:9011`,
      AUTHZ_CLIENT_ID: process.env.AUTHZ_CLIENT_ID,
      DEBUG: process.env.DEBUG
    })
    .withWaitStrategy(Wait.forLogMessage(/listening on port \d+/))
    .start();

  debug(`Container ${appImageName} started.`);

  return appContainer;
}

export async function createDatabaseAndAuthorizer() {
  let client, authorizerContainer;
  const dbHost = 'mariadb';

  const containerNetwork = await new Network().start();

  debug('Starting mariadb container...');
  const mariadbContainer = await new MariaDbContainer('mariadb:12.2.2')
    .withDatabase(process.env.DB_DATABASE)
    .withUsername(process.env.DB_USER)
    .withRootPassword(process.env.DB_ROOT_PASSWORD)
    .withUserPassword(process.env.DB_PASSWORD)
    .withName(dbHost)
    .withNetwork(containerNetwork)
    .start();

  try {
    debug('Starting database connection...');
    client = await mariadb.createConnection({
      host: mariadbContainer.getHost(),
      port: mariadbContainer.getPort(),
      database: mariadbContainer.getDatabase(),
      user: 'root',
      password: mariadbContainer.getRootPassword(),
      logger: () => { } // console.log // eslint-disable-line
    });

    debug('Creating prerequisite databases and users...');
    await client.query('CREATE DATABASE authorizer'); // must exist prior to authorizer
    await client.query(`CREATE USER IF NOT EXISTS '${process.env.DB_USER
      }'@'%' IDENTIFIED BY '${process.env.DB_PASSWORD}'`);
    await client.query(`CREATE USER IF NOT EXISTS '${process.env.DB_APP_USER
      }'@'%' IDENTIFIED BY '${process.env.DB_APP_PASSWORD}';`);

    debug('Starting authorizer container...');
    authorizerContainer = await new GenericContainer('localnerve/authorizer:1.5.3')
      .withEnvironment({
        ENV: 'production',
        ADMIN_SECRET: process.env.AUTHZ_ADMIN_SECRET,
        DATABASE_TYPE: 'mariadb',
        DATABASE_URL: `root:${process.env.DB_ROOT_PASSWORD}@tcp(${dbHost}:3306)/authorizer`,
        DATABASE_NAME: 'authorizer',
        ROLES: 'admin,user',
        DEFAULT_ROLES: 'user',
        APP_COOKIE_SECURE: !(process.env.WEBKIT == 1),
        //PROTECTED_ROLES: 'admin', // testing needs to use signup
        PORT: 9011
      })
      .withName('authorizer')
      .withExposedPorts(9011)
      .withNetwork(containerNetwork)
      .withWaitStrategy(Wait.forLogMessage(/Authorizer running at PORT: \d+/))
      .start();

    // sanity checks - jam_build and authorizer databases exist, authorizer tables exist
    // await client.query('show databases');
    // await client.query('show tables from authorizer');

    debug('Creating jam_build database tables...');
    await client.importFile({
      file: path.resolve(thisDir, toRoot, './data/database/002-mariadb-ddl-tables.sql')
    });

    debug('Creating jam_build database procedures...');
    const procText = await fs.readFile(
      path.resolve(thisDir, toRoot, './data/database/003-mariadb-ddl-procedures.sql'),
      { encoding: 'utf8' }
    );
    const procs = procText.split('$$').filter(text => !text.includes('DELIMITER'));
    for (const proc of procs) {
      await client.query(proc);
    }

    debug('Creating jam_build database privileges...');
    await client.importFile({
      file: path.resolve(thisDir, toRoot, './data/database/004-mariadb-ddl-privileges.sql')
    });

    // sanity check - procs should exist and be granted to jbuser and jbadmin
    // await client.query('SHOW PROCEDURE STATUS WHERE Db = \'jam_build\'');

  } finally {
    if (client) {
      await client.end();
    }
  }

  return {
    authorizerContainer,
    containerNetwork,
    mariadbContainer
  };
}