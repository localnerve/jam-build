/**
 * api tests
 * 
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */
import debugLib from 'debug';
import { expect, test } from './fixtures.js';
import {
  getData,
  postData,
  deleteData,
  genericRequest
} from './api.js';

const debug = debugLib('test:api:data/app');

test.describe('api/data/app', () => {
  let baseUrl;
  test.beforeAll(() => {
    baseUrl = `${process.env.BASE_URL}/api/data/app`;
  });

  test('audit request storage states', async ({ adminRequest, userRequest }) => {
    const adminState = await adminRequest.storageState();
    const userState = await userRequest.storageState();

    expect(adminState).toBeTruthy();
    expect(userState).toBeTruthy();

    debug('Admin request state', adminState);
    debug('User request state', userState);
  });

  test('get non-existant route', async ({ adminRequest }) => {
    return getData(adminRequest, baseUrl, 404);
  });

  test('post application home state and friends', async ({ adminRequest }) => {
    return postData(adminRequest, `${baseUrl}/home`, {
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
  });

  test('mutation access to app denied to user role', async ({ userRequest }) => {
    await postData(userRequest, `${baseUrl}/home`, {
      collections: [{
        collection: 'badnews',
        properties: {
          property1: 'value1', 
          property2: 'value2',
          property3: 'value3',
          property4: 'value4'
        }
      }]
    }, {
      expectSuccess: false,
      expectResponseSuccess: false,
      assertStatus: 403
    });

    await deleteData(userRequest, `${baseUrl}/home/friends`, {
      collections: [{
        collection: 'wontmatter',
        properties: ['property1', 'property2']
      }]
    }, {
      expectSuccess: false,
      expectResponseSuccess: false,
      assertStatus: 403
    });
  });

  test('get application home', async ({ adminRequest }) => {
    return getData(adminRequest, `${baseUrl}/home`, (expect, json) => {
      expect(json).toEqual(expect.objectContaining({
        state: expect.objectContaining({
          property1: 'value1',
          property2: 'value2'
        })
      }));
    });
  });

  test('get non-existing document', async ({ adminRequest }) => {
    return getData(adminRequest, `${baseUrl}/nonexistant`, (expect, json) => {
      expect(json.ok).not.toBeTruthy();
    }, 404);
  });

  test('get application home/state', async ({ adminRequest }) => {
    return getData(adminRequest, `${baseUrl}/home/state`, (expect, json) => {
      expect(json).toEqual(expect.objectContaining({
        property1: 'value1',
        property2: 'value2'
      }));
    });
  });

  test('get non-existing collection', async ({ adminRequest }) => {
    return getData(adminRequest, `${baseUrl}/home/nonexistant`, (expect, json) => {
      expect(json.ok).not.toBeTruthy();
    }, 404);
  });

  test('mutate a single property', async ({ adminRequest }) => {
    await getData(adminRequest, `${baseUrl}/home/friends`, (expect, json) => {
      expect(json).toEqual(expect.objectContaining({
        property2: 'value55'
      }));
    });
    await postData(adminRequest, `${baseUrl}/home`, {
      collections: {
        collection: 'friends',
        properties: {
          property2: 'value45'
        }
      }
    });
    return getData(adminRequest, `${baseUrl}/home/friends`, (expect, json) => {
      expect(json).toStrictEqual({
        property1: 'value44',
        property2: 'value45',
        property3: 'value46'
      });
    });
  });

  test('bad post with malformed data', async () => {
    await genericRequest(`${baseUrl}/home`, 'POST', '{ bad: data: is: bad }', (expect, fetchResponse) => {
      expect(fetchResponse.ok).not.toBeTruthy();
      expect(fetchResponse.status).toEqual(400);
    });
  });

  test('bad post with no data', async ({ adminRequest }) => {
    await postData (adminRequest, `${baseUrl}/home`, {}, {
      expectSuccess: false,
      expectResponse: true,
      expectResponseSuccess: false
    });
  });

  test('bad post with bad data', async ({ adminRequest }) => {
    await postData(adminRequest, `${baseUrl}/home`, {
      collections: {
        collection: 5
      }
    }, {
      expectSuccess: false,
      expectResponse: true,
      expectResponseSuccess: false
    });
  });

  test('delete a single property', async ({ adminRequest }) => {
    await getData(adminRequest, `${baseUrl}/home/friends`, (expect, json) => {
      expect(json).toEqual(expect.objectContaining({
        property3: 'value46'
      }));
    });
    await deleteData(adminRequest, `${baseUrl}/home`, {
      collections: { // can be an array or one object
        collection: 'friends',
        properties: ['property3']
      }
    });
    return getData(adminRequest, `${baseUrl}/home/friends`, (expect, json) => {
      expect(json).toEqual(expect.objectContaining({
        property1: 'value44',
        property2: 'value45'
      }));
      expect(json).not.toEqual(expect.objectContaining({
        property3: 'value46'
      }));
    });
  });

  test('empty collections that exist should return 204', async ({ adminRequest }) => {
    await postData(adminRequest, `${baseUrl}/home`, {
      collections: [{
        collection: 'girls',
        properties: {
          property1: 'value1',
          property2: 'value2'
        }
      }]
    });
    await getData(adminRequest, `${baseUrl}/home/girls`, (expect, json) => {
      expect(json).toStrictEqual({
        property1: 'value1',
        property2: 'value2'
      });
    });
    await deleteData(adminRequest, `${baseUrl}/home`, {
      collections: {
        collection: 'girls',
        properties: ['property1', 'property2']
      }
    });
    await getData(adminRequest, `${baseUrl}/home/girls`, 204);
  });

  test('delete a collection', async ({ adminRequest }) => {
    await getData(adminRequest, `${baseUrl}/home/friends`, (expect, json) => {
      expect(json).toEqual(expect.objectContaining({
        property1: 'value44'
      }));
    });
    await deleteData(adminRequest, `${baseUrl}/home/friends`);
    await getData(adminRequest, `${baseUrl}/home`, (expect, json) => {
      expect(json).toEqual(expect.objectContaining({
        state: expect.any(Object)
      }));
    });
    return getData(adminRequest, `${baseUrl}/home/friends`, (expect, json) => {
      expect(json.ok).not.toBeTruthy();
    }, 404);
  });

  test('delete the home document entirely', async ({ adminRequest }) => {
    await getData(adminRequest, `${baseUrl}/home`, (expect, json) => {
      expect(json).toEqual(expect.objectContaining({
        state: expect.any(Object)
      }));
    });
    await deleteData(adminRequest, `${baseUrl}/home`, {
      deleteDocument: true
    });
    return getData(adminRequest, `${baseUrl}/home`, (expect, json) => {
      expect(json.ok).not.toBeTruthy();
    }, 404);
  });
});
