/**
 * api/data/app tests
 * 
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */
/* eslint-disable playwright/expect-expect */
import { test } from '../fixtures.js';
import {
  getData,
  postData,
  deleteData,
  genericRequest
} from './api.js';

test.describe('/api/data/app', () => {
  let baseUrl;
  let version = '0';

  async function deleteHomeDocument (adminRequest, deleteCanFail = false) {
    try {
      await getData(adminRequest, `${baseUrl}/home`, (expect, json) => {
        version = json.home.__version;
      }, 200);

      version = await deleteData(adminRequest, `${baseUrl}/home`, {
        deleteDocument: true,
        version
      });
    } catch (error) {
      if (!deleteCanFail) {
        throw error;
      }
    }
  
    return getData(adminRequest, `${baseUrl}/home`, 404);
  }

  test.beforeAll(() => {
    baseUrl = `${process.env.BASE_URL}/api/data/app`;
  });

  test('clear home document, if required', async ({ adminRequest }) => {
    return deleteHomeDocument(adminRequest, true);
  });

  test('get non-existant route', async ({ adminRequest }) => {
    return getData(adminRequest, `${baseUrl}/nothingbetterbehere`, 404);
  });

  test('post application home state and friends', async ({ adminRequest }) => {
    version = await postData(adminRequest, `${baseUrl}/home`, {
      version,
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
      version,
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
      version,
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

  test('get application docs, colls, and props - all user types', async ({ adminRequest, userRequest, request }) => {
    const requestors = [adminRequest, userRequest, request];
    for (const requestor of requestors) {
      await getData(requestor, baseUrl, (expect, json) => {
        expect(json).toStrictEqual({
          home: {
            __version: expect.any(String),
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
        version = json.home.__version;
      });
    }
  });

  test('get application home - all user types', async ({ adminRequest, userRequest, request }) => {
    const result = {
      home: {
        __version: 'nope',
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
        version = json.home.__version;
        requestor.result.home.__version = version;
        expect(json).toStrictEqual(requestor.result);
      });
    }
  });

  test('get specific multiple collections', ({ adminRequest }) => {
    return getData(adminRequest, `${baseUrl}/home?collections=state&collections=friends`, (expect, json) => {
      expect(json).toEqual({
        home: {
          __version: expect.any(String),
          state: expect.any(Object),
          friends: expect.any(Object)
        }
      });
      version = json.home.__version;
    });
  });

  test('get specific collections, only one, less than the total', ({ adminRequest }) => {
    return getData(adminRequest, `${baseUrl}/home?collections=friends`, (expect, json) => {
      expect(json).toEqual({
        home: {
          __version: expect.any(String),
          friends: expect.any(Object)
        }
      });
      version = json.home.__version;
    });
  });

  test('get specific collections, deduplicate', ({ adminRequest }) => {
    return getData(adminRequest, `${baseUrl}/home?collections=friends&collections=friends`, (expect, json) => {
      expect(json).toEqual({
        home: {
          __version: expect.any(String),
          friends: expect.any(Object)
        }
      });
      version = json.home.__version;
    });
  });

  test('get include non-existant collections, ignored', ({ adminRequest }) => {
    return getData(adminRequest, `${baseUrl}/home?collections=friends&collections=nonexistant&collections=`, (expect, json) => {
      expect(json).toEqual({
        home: {
          __version: expect.any(String),
          friends: expect.any(Object)
        }
      });
      version = json.home.__version;
    });
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
          __version: expect.any(String),
          state: expect.objectContaining({
            property1: 'value1',
            property2: 'value2'
          })
        }
      });
      version = json.home.__version;
    });
  });

  test('get non-existing collection', async ({ adminRequest }) => {
    return getData(adminRequest, `${baseUrl}/home/nonexistant`, (expect, json) => {
      expect(json.ok).not.toBeTruthy();
    }, 404);
  });

  test('get non-existing collections with query string', ({ adminRequest }) => {
    return getData(adminRequest, `${baseUrl}/home?collections=nonexistant1&collections=nonexistant2`, (expect, json) => {
      expect(json.ok).not.toBeTruthy();
    }, 404);
  });

  test('mutate a single property', async ({ adminRequest }) => {
    await getData(adminRequest, `${baseUrl}/home/friends`, (expect, json) => {
      expect(json).toEqual({
        home: {
          __version: expect.any(String),
          friends: expect.objectContaining({
            property2: 'value55'
          })
        }
      });
      version = json.home.__version;
    });
    version = await postData(adminRequest, `${baseUrl}/home`, {
      version,
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
          __version: version,
          friends: {
            property1: 'value44',
            property2: 'value45',
            property3: 'value46'    
          }
        }
      });
    });
  });

  test('missing a single property does not delete the property', async ({ adminRequest }) => {
    await getData(adminRequest, `${baseUrl}/home/friends`, (expect, json) => {
      expect(json).toEqual({
        home: {
          __version: version,
          friends: expect.objectContaining({
            property3: 'value46'
          })
        }
      });
    });
    version = await postData(adminRequest, `${baseUrl}/home`, { // should have no effect
      version,
      collections: {
        collection: 'friends',
        properties: {
          property1: 'value44',
          property2: 'value45'
        }
      }
    });
    return getData(adminRequest, `${baseUrl}/home/friends`, (expect, json) => {
      expect(json).toStrictEqual({
        home: {
          __version: version,
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
      version,
      collections: {
        collection: 5
      }
    }, {
      expectSuccess: false,
      expectResponse: true,
      expectResponseSuccess: false
    });
  });

  test('delete a non-existent property without incident or effects', async ({ adminRequest}) => {
    await getData(adminRequest, `${baseUrl}/home/friends`, (expect, json) => {
      expect(json).toStrictEqual({
        home: {
          __version: expect.any(String),
          friends: {
            property1: 'value44',
            property2: 'value45',
            property3: 'value46'
          }
        }
      });
      version = json.home.__version;
    });
    version = await deleteData(adminRequest, `${baseUrl}/home`, {
      version,
      collections: [{ // can be an array or one object
        collection: 'friends',
        properties: ['property4'] // not there
      }]
    });
    await getData(adminRequest, `${baseUrl}/home/friends`, (expect, json) => {
      expect(json).toStrictEqual({
        home: {
          __version: version,
          friends: {
            property1: 'value44',
            property2: 'value45',
            property3: 'value46'
          }
        }
      });
    });
  });

  test('delete a single property', async ({ adminRequest }) => {
    await getData(adminRequest, `${baseUrl}/home/friends`, (expect, json) => {
      expect(json).toEqual({
        home: {
          __version: expect.any(String),
          friends: expect.objectContaining({
            property3: 'value46'
          })
        }
      });
    });
    version = await deleteData(adminRequest, `${baseUrl}/home`, {
      version,
      collections: { // can be an array or one object
        collection: 'friends',
        properties: ['property3']
      }
    });
    return getData(adminRequest, `${baseUrl}/home/friends`, (expect, json) => {
      expect(json).toEqual({
        home: {
          __version: version,
          friends: expect.objectContaining({
            property1: 'value44',
            property2: 'value45'
          })
        }
      });
      expect(json).not.toEqual({
        home: {
          __version: expect.any(String),
          friends: expect.objectContaining({
            property3: 'value46'
          })
        }
      });
    });
  });

  test('empty collections that exist should return 204', async ({ adminRequest }) => {
    version = await postData(adminRequest, `${baseUrl}/home`, {
      version,
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
          __version: version,
          girls: {
            property1: 'value1',
            property2: 'value2'
          }
        }
      });
    });
    version = await deleteData(adminRequest, `${baseUrl}/home`, {
      version,
      collections: {
        collection: 'girls',
        properties: ['property1', 'property2']
      }
    });
    await getData(adminRequest, `${baseUrl}/home/girls`, 204);
  });

  test('post empty collections, no property input', async ({ adminRequest }) => {
    version = await postData(adminRequest, `${baseUrl}/home`, {
      version,
      collections: [{
        collection: 'empty'
      }]
    });
    await getData(adminRequest, `${baseUrl}/home/empty`, 204);
    version = await deleteData(adminRequest, `${baseUrl}/home/empty`, {
      version
    });
    await getData(adminRequest, `${baseUrl}/home/empty`, 404);
  });

  test('update empty collections', async ({ adminRequest }) => {
    version = await postData(adminRequest, `${baseUrl}/home`, {
      version,
      collections: [{
        collection: 'empty'
      }]
    });
    await getData(adminRequest, `${baseUrl}/home/empty`, 204);
    version = await postData(adminRequest, `${baseUrl}/home`, {
      version,
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
      });
    });
    version = await deleteData(adminRequest, `${baseUrl}/home/empty`, {
      version
    });
  });

  test('delete multiple collections, no property input', async ({ adminRequest }) => {
    version = await postData(adminRequest, `${baseUrl}/home`, {
      version,
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
    version = await deleteData(adminRequest, `${baseUrl}/home`, {
      version,
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
          __version: expect.any(String),
          friends: expect.objectContaining({
            property1: 'value44'
          })
        }
      });
      version = json.home.__version;
    });
    version = await deleteData(adminRequest, `${baseUrl}/home/friends`, {
      version
    });
    await getData(adminRequest, `${baseUrl}/home`, (expect, json) => {
      expect(json).toEqual(expect.objectContaining({
        home: {
          __version: version,
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
          __version: version,
          state: expect.any(Object)
        }
      }));
    });
    await deleteHomeDocument(adminRequest);
  });
});
