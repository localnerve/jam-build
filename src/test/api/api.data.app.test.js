/**
 * api/data/app tests
 * 
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */
import { expect, test } from '../fixtures.js';
import {
  getData,
  postData,
  deleteData,
  genericRequest
} from './api.js';

test.describe('/api/data/app', () => {
  let baseUrl;

  async function deleteHomeDocument (adminRequest) {
    await deleteData(adminRequest, `${baseUrl}/home`, {
      deleteDocument: true
    });
    return getData(adminRequest, `${baseUrl}/home`, (expect, json) => {
      expect(json.ok).not.toBeTruthy();
    }, 404);
  }

  test.beforeAll(() => {
    baseUrl = `${process.env.BASE_URL}/api/data/app`;
  });

  test('delete home document', async ({ adminRequest }) => {
    return deleteHomeDocument(adminRequest);
  });

  test('get non-existant route', async ({ adminRequest }) => {
    return getData(adminRequest, `${baseUrl}/nothingbetterbehere`, 404);
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
        collection: 'wrongButWontMatter',
        properties: ['property1', 'property2']
      }]
    }, {
      expectSuccess: false,
      expectResponseSuccess: false,
      assertStatus: 403
    });
  });

  test('get application docs, colls, and props', async ({ adminRequest, userRequest, request }) => {
    const requestors = [adminRequest, userRequest, request];
    for (const requestor of requestors) {
      await getData(requestor, baseUrl, (expect, json) => {
        expect(json).toStrictEqual({
          home: {
            state: {
              property1: 'value1',
              property2: 'value2',
              property3: 'value3',
              property4: 'value4'
            },
            friends: {
              property1: 'value44',
              property2: 'value55',
              property3: 'value46'
            }
          }
        });
      });
    }
  });

  test('get application home', async ({ adminRequest, userRequest, request }) => {
    const result = {
      home: {
        state: {
          property1: 'value1',
          property2: 'value2',
          property3: 'value3',
          property4: 'value4'
        },
        friends: {
          property1: 'value44',
          property2: 'value55',
          property3: 'value46'
        }
      }
    };
    const requestors = [{
      request: adminRequest,
      result,
    }, {
      request: userRequest,
      result
    }, {
      request,
      result
    }];

    for (const requestor of requestors) {
      await getData(requestor.request, `${baseUrl}/home`, (expect, json) => {
        expect(json).toStrictEqual(requestor.result);
      });
    }
  });

  test('get non-existing document', async ({ adminRequest }) => {
    return getData(adminRequest, `${baseUrl}/nonexistant`, (expect, json) => {
      expect(json.ok).not.toBeTruthy();
    }, 404);
  });

  test('get application home/state', async ({ adminRequest }) => {
    return getData(adminRequest, `${baseUrl}/home/state`, (expect, json) => {
      expect(json).toEqual({
        home: {
          state: expect.objectContaining({
            property1: 'value1',
            property2: 'value2'
          })
        }
      });
    });
  });

  test('get non-existing collection', async ({ adminRequest }) => {
    return getData(adminRequest, `${baseUrl}/home/nonexistant`, (expect, json) => {
      expect(json.ok).not.toBeTruthy();
    }, 404);
  });

  test('mutate a single property', async ({ adminRequest }) => {
    await getData(adminRequest, `${baseUrl}/home/friends`, (expect, json) => {
      expect(json).toEqual({
        home: {
          friends: expect.objectContaining({
            property2: 'value55'
          })
        }
      });
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
        home: {
          friends: {
            property1: 'value44',
            property2: 'value45',
            property3: 'value46'    
          }
        }
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
      expect(json).toEqual({
        home: {
          friends: expect.objectContaining({
            property3: 'value46'
          })
        }
      });
    });
    await deleteData(adminRequest, `${baseUrl}/home`, {
      collections: { // can be an array or one object
        collection: 'friends',
        properties: ['property3']
      }
    });
    return getData(adminRequest, `${baseUrl}/home/friends`, (expect, json) => {
      expect(json).toEqual({
        home: {
          friends: expect.objectContaining({
            property1: 'value44',
            property2: 'value45'
          })
        }
      });
      expect(json).not.toEqual({
        home: {
          friends: expect.objectContaining({
            property3: 'value46'
          })
        }
      });
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
        home: {
          girls: {
            property1: 'value1',
            property2: 'value2'
          }
        }
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

  test('post empty collections, no property input', async ({ adminRequest }) => {
    await postData(adminRequest, `${baseUrl}/home`, {
      collections: [{
        collection: 'empty'
      }]
    });
    await getData(adminRequest, `${baseUrl}/home/empty`, 204);
    await deleteData(adminRequest, `${baseUrl}/home/empty`);
    await getData(adminRequest, `${baseUrl}/home/empty`, 404);
  });

  test('update empty collections', async ({ adminRequest }) => {
    await postData(adminRequest, `${baseUrl}/home`, {
      collections: [{
        collection: 'empty'
      }]
    });
    await getData(adminRequest, `${baseUrl}/home/empty`, 204);
    await postData(adminRequest, `${baseUrl}/home`, {
      collections: {
        collection: 'empty',
        properties: {
          property13: 'value13',
          property14: 'value14'
        }
      }
    });
    await getData(adminRequest, `${baseUrl}/home/empty`, (expect, json) => {
      expect(json).toEqual({
        home: expect.objectContaining({
          empty: {
            property13: 'value13',
            property14: 'value14'
          }
        })
      })
    });
    await deleteData(adminRequest, `${baseUrl}/home/empty`);
  });

  test('delete multiple collections, no property input', async ({ adminRequest }) => {
    await postData(adminRequest, `${baseUrl}/home`, {
      collections: [{
        collection: 'other1',
        properties: {
          property1: 'value81',
          property2: 'value82'
        }
      }, {
        collection: 'other2',
        properties: {
          property3: 'value83',
          property4: 'value84'
        }
      }]
    });
    await getData(adminRequest, `${baseUrl}/home`, (expect, json) => {
      expect(json).toEqual({
        home: expect.objectContaining({
          other1: {
            property1: 'value81',
            property2: 'value82'
          },
          other2: {
            property3: 'value83',
            property4: 'value84'
          }
        })
      });
    });
    await deleteData(adminRequest, `${baseUrl}/home`, {
      collections: [{
        collection: 'other1'
      }, {
        collection: 'other2'
      }]
    });
    await getData(adminRequest, `${baseUrl}/home`, (expect, json) => {
      expect(json).toEqual({
        home: expect.not.objectContaining({
          other1: expect.any(Object),
          other2: expect.any(Object)
        })
      });
    });
  });

  test('delete one collection', async ({ adminRequest }) => {
    await getData(adminRequest, `${baseUrl}/home/friends`, (expect, json) => {
      expect(json).toEqual({
        home: {
          friends: expect.objectContaining({
            property1: 'value44'
          })
        }
      });
    });
    await deleteData(adminRequest, `${baseUrl}/home/friends`);
    await getData(adminRequest, `${baseUrl}/home`, (expect, json) => {
      expect(json).toEqual(expect.objectContaining({
        home: {
          state: expect.any(Object)
        }
      }));
    });
    return getData(adminRequest, `${baseUrl}/home/friends`, (expect, json) => {
      expect(json.ok).not.toBeTruthy();
    }, 404);
  });

  test('delete the home document entirely', async ({ adminRequest }) => {
    await getData(adminRequest, `${baseUrl}/home`, (expect, json) => {
      expect(json).toEqual(expect.objectContaining({
        home: {
          state: expect.any(Object)
        }
      }));
    });
    await deleteHomeDocument(adminRequest);
  });
});
