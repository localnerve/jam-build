/**
 * api/data/user tests
 * 
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */
import { request } from 'express';
import { test } from '../fixtures.js';
import {
  getData,
  postData,
  deleteData,
  genericRequest
} from './api.js';

test.describe('/api/data/user', () => {
  let baseUrl;
  const version = {
    user: '0',
    admin: '0'
  };

  async function deleteHomeDocument (userRequest, adminRequest, canFail = false) {
    const requestors = [[userRequest, 'user'], [adminRequest, 'admin']];
    for (const [requestor, user] of requestors) {
      try {
        await getData(requestor, `${baseUrl}/home`, (expect, json) => {
          version[user] = json.home.__version;
        }, 200);

        version[user] = await deleteData(requestor, `${baseUrl}/home`, {
          version: version[user],
          deleteDocument: true
        });

        await getData(requestor, `${baseUrl}/home`, 404);
      } catch (e) {
        if (!canFail) {
          throw e;
        }
      }
    }
  }

  test.beforeAll(() => {
    baseUrl = `${process.env.BASE_URL}/api/data/user`;
  });

  test('clear home document, if required', async ({ userRequest, adminRequest }) => {
    return deleteHomeDocument(userRequest, adminRequest, true);
  });

  test('get non-existant route', async ({ userRequest }) => {
    return getData(userRequest, baseUrl, 404);
  });

  test('post user home state and friends', async ({ userRequest }) => {
    version.user = await postData(userRequest, `${baseUrl}/home`, {
      version: version.user,
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

  test('post admin user home state and friends', async ({ adminRequest }) => {
    version.admin = await postData(adminRequest, `${baseUrl}/home`, {
      version: version.admin,
      collections: [{
        collection: 'state',
        properties: {
          property1: 'value5',
          property2: 'value6',
          property3: 'value7',
          property4: 'value8'
        }
      }, {
        collection: 'friends',
        properties: { 
          property1: 'value64',
          property2: 'value75',
          property3: 'value66'
        }
      }]
    });
  });

  test('post public mutation denied', async ({ request }) => {
    await postData(request, `${baseUrl}/home`, {
      version: version.user,
      collections: [{
        collection: 'state',
        properties: {
          property1: 'value9', 
          property2: 'value10',
          property3: 'value11',
          property4: 'value12'
        }
      }, {
        collection: 'friends',
        properties: { 
          property1: 'value14',
          property2: 'value25',
          property3: 'value16'
        }
      }]
    }, {
      expectSuccess: false,
      assertStatus: 403,
      expectResponseSuccess: false
    });
  });

  test('get user docs, colls, and props', async ({ adminRequest, userRequest }) => {
    const requestors = [{
      request: adminRequest,
      result: {
        home: {
          __version: version.admin,
          state: {
            property1: 'value5',
            property2: 'value6',
            property3: 'value7',
            property4: 'value8'
          },
          friends: {
            property1: 'value64',
            property2: 'value75',
            property3: 'value66'
          }
        }
      }
    }, {
      request: userRequest,
      result: {
        home: {
          __version: version.user,
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
      }
    }];
    for (const requestor of requestors) {
      await getData(requestor.request, baseUrl, (expect, json) => {
        expect(json).toStrictEqual(requestor.result);
      });
    }
  });

  test('get user docs, colls, and props - public fail', async ({ request }) => {
    return getData(request, baseUrl, 403);
  });

  test('get user user application home', async ({ userRequest }) => {
    return getData(userRequest, `${baseUrl}/home`, (expect, json) => {
      expect(json).toEqual(expect.objectContaining({
        home: {
          __version: version.user,
          state: expect.objectContaining({
            property1: 'value1',
            property2: 'value2'
          }),
          friends: expect.objectContaining({
            property1: 'value44',
            property2: 'value55'
          })
        }
      }));
    });
  });

  test('get admin user application home', async ({ adminRequest }) => {
    return getData(adminRequest, `${baseUrl}/home`, (expect, json) => {
      expect(json).toEqual({
        home: {
          __version: version.admin,
          state: expect.objectContaining({
            property1: 'value5',
            property2: 'value6'
          }),
          friends: expect.objectContaining({
            property1: 'value64',
            property2: 'value75'
          })
        }
      });
    });
  });

  test('get non-existing document', async ({ userRequest, adminRequest }) => {
    await getData(userRequest, `${baseUrl}/nonexistant`, (expect, json) => {
      expect(json.ok).not.toBeTruthy();
    }, 404);
    await getData(adminRequest, `${baseUrl}/nonexistant`, (expect, json) => {
      expect(json.ok).not.toBeTruthy();
    }, 404);
  });

  test('get application home/state', async ({ userRequest, adminRequest }) => {
    await getData(userRequest, `${baseUrl}/home/state`, (expect, json) => {
      expect(json).toEqual({
        home: {
          __version: version.user,
          state: expect.objectContaining({
            property1: 'value1',
            property2: 'value2'
          })
        }
      });
    });
    await getData(adminRequest, `${baseUrl}/home/state`, (expect, json) => {
      expect(json).toEqual({
        home: {
          __version: version.admin,
          state: expect.objectContaining({
            property1: 'value5',
            property2: 'value6'
          })
        }
      });
    });
  });

  test('get non-existing collection', async ({ userRequest, adminRequest }) => {
    await getData(userRequest, `${baseUrl}/home/nonexistant`, (expect, json) => {
      expect(json.ok).not.toBeTruthy();
    }, 404);

    await getData(adminRequest, `${baseUrl}/home/nonexistant`, (expect, json) => {
      expect(json.ok).not.toBeTruthy();
    }, 404);
  });

  test('get specific multiple collections', ({ userRequest }) => {
    return getData(userRequest, `${baseUrl}/home?collections=state&collections=friends`, (expect, json) => {
      expect(json).toEqual({
        home: {
          __version: version.user,
          state: expect.any(Object),
          friends: expect.any(Object)
        }
      });
    });
  });

  test('get specific collections, only one, less than the total', ({ userRequest }) => {
    return getData(userRequest, `${baseUrl}/home?collections=friends`, (expect, json) => {
      expect(json).toEqual({
        home: {
          __version: version.user,
          friends: expect.any(Object)
        }
      });
    });
  });

  test('get specific collections, deduplicate', ({ userRequest }) => {
    return getData(userRequest, `${baseUrl}/home?collections=friends&collections=friends`, (expect, json) => {
      expect(json).toEqual({
        home: {
          __version: expect.any(String),
          friends: expect.any(Object)
        }
      });
    });
  });

  test('get include non-existant collections, ignored', ({ userRequest }) => {
    return getData(userRequest, `${baseUrl}/home?collections=friends&collections=nonexistant&collections=`, (expect, json) => {
      expect(json).toEqual({
        home: {
          __version: expect.any(String),
          friends: expect.any(Object)
        }
      });
    });
  });

  test('mutate a single property, user', async ({ userRequest }) => {
    await getData(userRequest, `${baseUrl}/home/friends`, (expect, json) => {
      expect(json).toEqual(expect.objectContaining({
        home: {
          __version: expect.any(String),
          friends: expect.objectContaining({
            property2: 'value55'
          })
        }
      }));
    });
    version.user = await postData(userRequest, `${baseUrl}/home`, {
      version: version.user,
      collections: {
        collection: 'friends',
        properties: {
          property2: 'value45'
        }
      }
    });
    await getData(userRequest, `${baseUrl}/home/friends`, (expect, json) => {
      expect(json).toStrictEqual({
        home: {
          __version: version.user,
          friends: {
            property1: 'value44',
            property2: 'value45',
            property3: 'value46'
          }
        }
      });
    });
  });

  test('mutate a single property, admin', async ({ adminRequest }) => {
    await getData(adminRequest, `${baseUrl}/home/friends`, (expect, json) => {
      expect(json).toEqual(expect.objectContaining({
        home: {
          __version: version.admin,
          friends: expect.objectContaining({
            property2: 'value75'
          })
        }
      }));
    });
    version.admin = await postData(adminRequest, `${baseUrl}/home`, {
      version: version.admin,
      collections: {
        collection: 'friends',
        properties: {
          property2: 'value65'
        }
      }
    });
    await getData(adminRequest, `${baseUrl}/home/friends`, (expect, json) => {
      expect(json).toStrictEqual({
        home: {
          __version: version.admin,
          friends: {
            property1: 'value64',
            property2: 'value65',
            property3: 'value66'
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

  test('bad post with no data', async ({ userRequest, adminRequest }) => {
    await postData (userRequest, `${baseUrl}/home`, {}, {
      expectSuccess: false,
      expectResponse: true,
      expectResponseSuccess: false
    });
    await postData (adminRequest, `${baseUrl}/home`, {}, {
      expectSuccess: false,
      expectResponse: true,
      expectResponseSuccess: false
    });
  });

  test('bad post with bad data', async ({ userRequest, adminRequest }) => {
    await postData(userRequest, `${baseUrl}/home`, {
      version: version.user,
      collections: {
        collection: 5
      }
    }, {
      expectSuccess: false,
      expectResponse: true,
      expectResponseSuccess: false
    });
    await postData(adminRequest, `${baseUrl}/home`, {
      version: version.admin,
      collections: {
        collection: 5
      }
    }, {
      expectSuccess: false,
      expectResponse: true,
      expectResponseSuccess: false
    });
  });

  test('delete a single property, user', async ({ userRequest }) => {
    await getData(userRequest, `${baseUrl}/home/friends`, (expect, json) => {
      expect(json).toEqual(expect.objectContaining({
        home: {
          __version: expect.any(String),
          friends: expect.objectContaining({
            property3: 'value46'
          })
        }
      }));
    });
    version.user = await deleteData(userRequest, `${baseUrl}/home`, {
      version: version.user,
      collections: { // can be an array or one object
        collection: 'friends',
        properties: ['property3']
      }
    });
    await getData(userRequest, `${baseUrl}/home/friends`, (expect, json) => {
      expect(json).toEqual(expect.objectContaining({
        home: {
          __version: version.user,
          friends: {
            property1: 'value44',
            property2: 'value45'
          }
        }
      }));
      expect(json).not.toEqual(expect.objectContaining({
        home: {
          __version: expect.any(String),
          friends: expect.objectContaining({
            property3: 'value46'
          })
        }
      }));
    });
  });

  test('delete a single property, admin', async ({ adminRequest }) => {
    await getData(adminRequest, `${baseUrl}/home/friends`, (expect, json) => {
      expect(json).toEqual(expect.objectContaining({
        home: {
          __version: expect.any(String),
          friends: expect.objectContaining({
            property3: 'value66'
          })
        }
      }));
    });
    version.admin = await deleteData(adminRequest, `${baseUrl}/home`, {
      version: version.admin,
      collections: { // can be an array or one object
        collection: 'friends',
        properties: ['property3']
      }
    });
    await getData(adminRequest, `${baseUrl}/home/friends`, (expect, json) => {
      expect(json).toEqual(expect.objectContaining({
        home: {
          __version: version.admin,
          friends: expect.objectContaining({
            property1: 'value64',
            property2: 'value65'    
          })
        }
      }));
      expect(json).not.toEqual(expect.objectContaining({
        home: {
          __version: expect.any(String),
          friends: expect.objectContaining({
            property3: 'value66'
          })
        }
      }));
    });
  });

  test('empty collections that exist should return 204, user', async ({ userRequest }) => {
    version.user = await postData(userRequest, `${baseUrl}/home`, {
      version: version.user,
      collections: [{
        collection: 'girls',
        properties: {
          property1: 'value1',
          property2: 'value2'
        }
      }]
    });
    await getData(userRequest, `${baseUrl}/home/girls`, (expect, json) => {
      expect(json).toStrictEqual({
        home: {
          __version: version.user,
          girls: {
            property1: 'value1',
            property2: 'value2'
          }
        }
      });
    });
    version.user = await deleteData(userRequest, `${baseUrl}/home`, {
      version: version.user,
      collections: {
        collection: 'girls',
        properties: ['property1', 'property2']
      }
    });
    await getData(userRequest, `${baseUrl}/home/girls`, 204);
  });

  test('empty collections that exist should return 204, admin', async ({ adminRequest }) => {
    version.admin = await postData(adminRequest, `${baseUrl}/home`, {
      version: version.admin,
      collections: [{
        collection: 'girls',
        properties: {
          property1: 'value11',
          property2: 'value12'
        }
      }]
    });
    await getData(adminRequest, `${baseUrl}/home/girls`, (expect, json) => {
      expect(json).toStrictEqual({
        home: {
          __version: version.admin,
          girls: {
            property1: 'value11',
            property2: 'value12'
          }
        }
      });
    });
    version.admin = await deleteData(adminRequest, `${baseUrl}/home`, {
      version: version.admin,
      collections: {
        collection: 'girls',
        properties: ['property1', 'property2']
      }
    });
    await getData(adminRequest, `${baseUrl}/home/girls`, 204);
  });

  test('delete a collection, user', async ({ userRequest }) => {
    await getData(userRequest, `${baseUrl}/home/friends`, (expect, json) => {
      expect(json).toEqual(expect.objectContaining({
        home: {
          __version: expect.any(String),
          friends: expect.objectContaining({
            property1: 'value44'
          })
        }
      }));
    });
    version.user = await deleteData(userRequest, `${baseUrl}/home/friends`, {
      version: version.user
    });
    await getData(userRequest, `${baseUrl}/home`, (expect, json) => {
      expect(json).toEqual(expect.objectContaining({
        home: {
          __version: version.user,
          state: expect.any(Object)
        }
      }));
    });
    await getData(userRequest, `${baseUrl}/home/friends`, (expect, json) => {
      expect(json.ok).not.toBeTruthy();
    }, 404);
  });

  test('delete a collection, admin', async ({ adminRequest }) => {
    await getData(adminRequest, `${baseUrl}/home/friends`, (expect, json) => {
      expect(json).toEqual(expect.objectContaining({
        home: {
          __version: expect.any(String),
          friends: expect.objectContaining({
            property1: 'value64'
          })
        }
      }));
    });
    version.admin = await deleteData(adminRequest, `${baseUrl}/home/friends`, {
      version: version.admin
    });
    await getData(adminRequest, `${baseUrl}/home`, (expect, json) => {
      expect(json).toEqual(expect.objectContaining({
        home: {
          __version: version.admin,
          state: expect.any(Object)
        }
      }));
    });
    await getData(adminRequest, `${baseUrl}/home/friends`, (expect, json) => {
      expect(json.ok).not.toBeTruthy();
    }, 404);
  });

  test('delete the home document entirely', async ({ userRequest, adminRequest }) => {
    return deleteHomeDocument(userRequest, adminRequest);
  });
});
