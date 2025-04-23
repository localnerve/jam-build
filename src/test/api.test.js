/**
 * api tests
 * 
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */
import { test } from '@playwright/test';
import debugLib from 'debug';
import {
  getData,
  postData,
  deleteData
} from './api.js';

const debug = debugLib('test-api');

test.describe('api/data', () => {
  let baseUrl;
  test.beforeAll(() => {
    baseUrl = `${process.env.BASE_URL}/api/data`;
  });

  test('get non-existant route', async ({ request }) => {
    return getData(request, baseUrl, 404);
  });

  test('post application home state and friends', async ({ request }) => {
    return postData(request, `${baseUrl}/home`, {
      collections: [{
        collection: 'state',
        properties: {
          property1: 'value1', 
          property2: 'value2',
          property3: 'value3',
          property4: 'value4'
        }
      }, {
        collection: 'friends',
        properties: { 
          property1: 'value44',
          property2: 'value55',
          property3: 'value46'
        }
      }]
    });
  })

  test('get application home', async ({ request }) => {
    return getData(request, `${baseUrl}/home`, 200, (expect, json) => {
      expect(json).toEqual(expect.objectContaining({
        state: expect.objectContaining({
          property1: 'value1',
          property2: 'value2'
        })
      }));
    });
  });

  test('get non-existing document', async ({ request }) => {
    return getData(request, `${baseUrl}/nonexistant`, 404, (expect, json) => {
      expect(json).toStrictEqual({});
    });
  });

  test('get application home/state', async ({ request }) => {
    return getData(request, `${baseUrl}/home/state`, 200, (expect, json) => {
      expect(json).toEqual(expect.objectContaining({
        property1: 'value1',
        property2: 'value2'
      }));
    });
  });

  test('get non-existing collection', async ({ request }) => {
    return getData(request, `${baseUrl}/home/nonexistant`, 404, (expect, json) => {
      expect(json).toStrictEqual({});
    });
  });

  test('mutate a single property', async ({ request }) => {
    await getData(request, `${baseUrl}/home/friends`, 200, (expect, json) => {
      expect(json).toEqual(expect.objectContaining({
        property2: 'value55'
      }));
    });
    await postData(request, `${baseUrl}/home`, {
      collections: {
        collection: 'friends',
        properties: {
          property2: 'value45'
        }
      }
    });
    return getData(request, `${baseUrl}/home/friends`, 200, (expect, json) => {
      expect(json).toStrictEqual({
        property1: 'value44',
        property2: 'value45',
        property3: 'value46'
      });
    });
  });

  test('delete a single property', async ({ request }) => {
    await getData(request, `${baseUrl}/home/friends`, 200, (expect, json) => {
      expect(json).toEqual(expect.objectContaining({
        property3: 'value46'
      }));
    });
    await deleteData(request, `${baseUrl}/home`, {
      collections: {
        collection: 'friends',
        properties: ['property3']
      }
    });
    return getData(request, `${baseUrl}/home/friends`, 200, (expect, json) => {
      expect(json).toEqual(expect.objectContaining({
        property1: 'value44',
        property2: 'value45'
      }));
      expect(json).not.toEqual(expect.objectContaining({
        property3: 'value46'
      }));
    });
  });

  test('empty collections that exist should return 204', async ({ request }) => {
    await postData(request, `${baseUrl}/home`, {
      collections: [{
        collection: 'girls',
        properties: {
          property1: 'value1',
          property2: 'value2'
        }
      }]
    });
    await getData(request, `${baseUrl}/home/girls`, 200, (expect, json) => {
      expect(json).toStrictEqual({
        property1: 'value1',
        property2: 'value2'
      });
    });
    await deleteData(request, `${baseUrl}/home`, {
      collections: {
        collection: 'girls',
        properties: ['property1', 'property2']
      }
    });
    await getData(request, `${baseUrl}/home/girls`, 204);
  });

  test('delete a collection', async ({ request }) => {
    await getData(request, `${baseUrl}/home/friends`, 200, (expect, json) => {
      expect(json).toEqual(expect.objectContaining({
        property1: 'value44'
      }));
    });
    await deleteData(request, `${baseUrl}/home/friends`);
    await getData(request, `${baseUrl}/home`, 200, (expect, json) => {
      expect(json).toEqual(expect.objectContaining({
        state: expect.any(Object)
      }));
    });
    return getData(request, `${baseUrl}/home/friends`, 404, (expect, json) => {
      expect(json).toStrictEqual({});
    });
  });

  test('delete the home document entirely', async ({ request }) => {
    await getData(request, `${baseUrl}/home`, 200, (expect, json) => {
      expect(json).toEqual(expect.objectContaining({
        state: expect.any(Object)
      }));
    });
    await deleteData(request, `${baseUrl}/home`, {
      deleteDocument: true
    });
    return getData(request, `${baseUrl}/home`, 404, (expect, json) => {
      expect(json).toStrictEqual({});
    });
  });
});
