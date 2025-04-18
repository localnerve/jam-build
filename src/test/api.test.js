/**
 * api tests
 * 
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */
import { test } from '@playwright/test';
import {
  createAppContainer,
  createDatabaseAndAuthorizer,
  getResponse
} from './api.js';

const baseUrl = process.env.BASE_URL;

test.describe('api/data', () => {
  const appImageName = 'jam-build-test-1';
  const apiData = `${baseUrl}/api/data`;
  let appContainer, authorizerContainer, containerNetwork, mariadbContainer;

  test.beforeAll(async () => {
    test.setTimeout(180_000);
    ({ authorizerContainer, containerNetwork, mariadbContainer } = await createDatabaseAndAuthorizer());
    appContainer = await createAppContainer(containerNetwork, mariadbContainer, appImageName);
  });

  test.afterAll(async () => {
    if (appContainer) {
      await appContainer?.stop({
        remove: false
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
  });

  test('application home', ({ page }) => {
    const url = `http://${appContainer.getHost()}:${appContainer.getMappedPort(5000)}`;
    return getResponse(page, `${url}/api/data/home`);
  });

  test.skip('application home/state', ({ page }) => {
    return getResponse(page, `${apiData}/home/state`);
  });
});
