/**
 * Setup the services of the app.
 * 
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */
import path from 'node:path';
import url from 'node:url';
import os from 'node:os';
import fs from 'node:fs/promises';
import { GenericContainer, Network, Wait, getContainerRuntimeClient, PullPolicy } from 'testcontainers';
import mariadb from 'mariadb';
import { MariaDbContainer } from '@testcontainers/mariadb';
import debugLib from 'debug';

const thisDir = url.fileURLToPath(new URL('.', import.meta.url));
const toRoot = '../..';
const debug = debugLib('test-services');

/*
async function deleteImageByName (imageName) {
  const dockerode = (await getContainerRuntimeClient()).container.dockerode;
  await dockerode.getImage(imageName).remove();
}
*/

async function checkImageExists (imageName) {
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

export async function createAppContainer (containerNetwork, mariadbContainer, appImageName) {
  const forceAppBuild = !!(process.env.FORCE_BUILD);

  debug(`Checking ${appImageName}... FORCE_BUILD=${forceAppBuild}`);
  
  let appContainerImage;
  if (await checkImageExists(appImageName) && !forceAppBuild) {
    debug(`Using image ${appImageName} without building...`);
    appContainerImage = new GenericContainer(appImageName);
  } else {
    const userInfo = os.userInfo();
    debug(`Building image ${appImageName}`, userInfo, os.arch());
    appContainerImage = await GenericContainer.fromDockerfile(path.resolve(thisDir, toRoot))
      .withBuildArgs({
        UID: `${userInfo.uid}`,
        GID: `${userInfo.gid}`,
        TARGETARCH: `${os.arch()}`
      })
      .withCache(true)
      .build(appImageName, {
        deleteOnExit: false
      });
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
      DEBUG: 'server*,api*'
    })
    .withWaitStrategy(Wait.forLogMessage(/listening on port \d+/))
    .start();
  
  debug(`Container ${appImageName} started.`);

  return appContainer;
}

export async function createDatabaseAndAuthorizer () {
  let client, authorizerContainer;
  const dbHost = 'mariadb';

  const containerNetwork = await new Network().start();

  debug('Starting mariadb container...');
  const mariadbContainer = await new MariaDbContainer('mariadb:11.7.2')
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
      logger: console.log // eslint-disable-line
    });
    
    debug('Creating prerequisite databases and users...');
    await client.query('CREATE DATABASE authorizer'); // must exist prior to authorizer
    await client.query(`CREATE USER IF NOT EXISTS '${
      process.env.DB_USER
    }'@'%' IDENTIFIED BY '${process.env.DB_PASSWORD}'`);
    await client.query(`CREATE USER IF NOT EXISTS '${
      process.env.DB_APP_USER
    }'@'%' IDENTIFIED BY '${process.env.DB_APP_PASSWORD}';`);

    debug('Starting authorizer container...');
    authorizerContainer = await new GenericContainer('lakhansamani/authorizer:1.4.4')
      .withEnvironment({
        ENV: 'development',
        DATABASE_TYPE: 'mariadb',
        DATABASE_URL: `root:${process.env.DB_ROOT_PASSWORD}@tcp(${dbHost}:3306)/authorizer`,
        DATABASE_NAME: 'authorizer',
        DATABASE_USER: 'root',
        DATABASE_PASSWORD: process.env.DB_ROOT_PASSWORD,
        ROLES: 'user,admin'
      })
      .withName('authorizer')
      .withNetwork(containerNetwork)
      .withWaitStrategy(Wait.forLogMessage(/Authorizer running at PORT: \d+/))
      .start();

    // sanity checks - jam_build and authorizer databases exist, authorizer tables exist
    // await client.query('show databases');
    // await client.query('show tables from authorizer');
    
    debug('Creating jam_build database tables...');
    await client.importFile({
      file: path.resolve(thisDir, toRoot, './data/database/mariadb-ddl-tables.sql')
    });

    debug('Creating jam_build database procedures...');
    const procText = await fs.readFile(
      path.resolve(thisDir, toRoot, './data/database/mariadb-ddl-procedures.sql'),
      { encoding: 'utf8' }
    );
    const procs = procText.split('//').filter(text => !text.includes('DELIMITER'));
    for (const proc of procs) {
      await client.query(proc);
    }

    debug('Creating jam_build database privileges...');
    await client.importFile({
      file: path.resolve(thisDir, toRoot, './data/database/mariadb-ddl-privileges.sql')
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
