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
  getData,
  postData
} from './api.js';

test.describe('api/data', () => {
  const appImageName = 'jam-build-test-1';
  let baseUrl;
  let appContainer, authorizerContainer, containerNetwork, mariadbContainer;

  test.beforeAll(async () => {
    test.setTimeout(180_000);
    ({ authorizerContainer, containerNetwork, mariadbContainer } = await createDatabaseAndAuthorizer());
    appContainer = await createAppContainer(containerNetwork, mariadbContainer, appImageName);
    baseUrl = `http://${appContainer.getHost()}:${appContainer.getMappedPort(5000)}/api/data`;
  });

  test.afterAll(async () => {
    if (appContainer) {
      await appContainer.stop();
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

  test('put application home state', async ({ request }) => {
    return postData(request, `${baseUrl}/values`, {
      document: 'home',
      collection: 'state',
      properties: [{
        property_name: 'property1',
        property_value: 'value1'
      }, {
        property_name: 'property2',
        property_value: 'value2'
      }]
    });
  });

  test('get application home', async ({ request }) => {
    return getData(request, `${baseUrl}/home`, (expect, json) => {
      expect(json).toEqual(expect.objectContaining({
        state: {
          property1: 'value1',
          property2: 'value2'
        }
      }));
    });
  });

  test('get non-existing document', async ({ request }) => {
    return getData(request, `${baseUrl}/nonexistant`, (expect, json) => {
      expect(json).toStrictEqual({});
    });
  });

  test('get application home/state', async ({ request }) => {
    return getData(request, `${baseUrl}/home/state`, (expect, json) => {
      expect(json).toEqual(expect.objectContaining({
        property1: 'value1',
        property2: 'value2'
      }));
    });
  });

  test('get non-existing collection', async ({ request }) => {
    return getData(request, `${baseUrl}/home/nonexistant`, (expect, json) => {
      expect(json).toStrictEqual({});
    });
  });
});
