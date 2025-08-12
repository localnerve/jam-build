/**
 * api/data/user tests
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
/* eslint-disable playwright/expect-expect */
import { expect, test } from '#test/fixtures.js';
import {
  getData,
  postData,
  deleteData,
  genericRequest
} from './api.js';
import { deleteHomeDocument } from './utils.js';

test.describe('/api/data/user', () => {
  let baseUrl;
  const version = {
    user: '0',
    admin: '0'
  };

  test.beforeAll(() => {
    baseUrl = `${process.env.BASE_URL}/api/data/user`;
  });

  test.beforeEach(async ({ adminRequest, userRequest }) => {
    version.user = await postData(userRequest, `${baseUrl}/home`, {
      version : version.user,
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

  test.afterEach(async ({ adminRequest, userRequest }) => {
    const versions = await deleteHomeDocument([
      [userRequest, baseUrl, 'user'],
      [adminRequest, baseUrl, 'admin']
    ], true);

    Object.assign(version, { admin: '0', user: '0' }, versions);
  });

  test('get non-existant route', async ({ userRequest }) => {
    await getData(userRequest, `${baseUrl}/non-existant-route`, 404);
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
      await getData(requestor.request, baseUrl, json => {
        expect(json).toStrictEqual(requestor.result);
      });
    }
  });

  test('get user docs, colls, and props - public fail', async ({ request }) => {
    await getData(request, baseUrl, 403);
  });

  test('get user user application home', async ({ userRequest }) => {
    await getData(userRequest, `${baseUrl}/home`, json => {
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
    await getData(adminRequest, `${baseUrl}/home`, json => {
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
    await getData(userRequest, `${baseUrl}/nonexistant`, json => {
      expect(json.ok).not.toBeTruthy();
    }, 404);

    await getData(adminRequest, `${baseUrl}/nonexistant`, json => {
      expect(json.ok).not.toBeTruthy();
    }, 404);
  });

  test('get application home/state', async ({ userRequest, adminRequest }) => {
    await getData(userRequest, `${baseUrl}/home/state`, json => {
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

    await getData(adminRequest, `${baseUrl}/home/state`, json => {
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
    await getData(userRequest, `${baseUrl}/home/nonexistant`, json => {
      expect(json.ok).not.toBeTruthy();
    }, 404);

    await getData(adminRequest, `${baseUrl}/home/nonexistant`, json => {
      expect(json.ok).not.toBeTruthy();
    }, 404);
  });

  test('get specific multiple collections', async ({ userRequest }) => {
    await getData(userRequest, `${baseUrl}/home?collections=state&collections=friends`, json => {
      expect(json).toEqual({
        home: {
          __version: version.user,
          state: expect.any(Object),
          friends: expect.any(Object)
        }
      });
    });
  });

  test('get specific collections, only one, less than the total', async ({ userRequest }) => {
    await getData(userRequest, `${baseUrl}/home?collections=friends`, json => {
      expect(json).toEqual({
        home: {
          __version: version.user,
          friends: expect.any(Object)
        }
      });
    });
  });

  test('get specific collections, deduplicate', async ({ userRequest }) => {
    await getData(userRequest, `${baseUrl}/home?collections=friends&collections=friends`, json => {
      expect(json).toEqual({
        home: {
          __version: expect.any(String),
          friends: expect.any(Object)
        }
      });
    });
  });

  test('get include non-existant collections, ignored', async ({ userRequest }) => {
    await getData(userRequest, `${baseUrl}/home?collections=friends&collections=nonexistant&collections=`, json => {
      expect(json).toEqual({
        home: {
          __version: expect.any(String),
          friends: expect.any(Object)
        }
      });
    });
  });

  test('mutate a single property, user', async ({ userRequest }) => {
    await getData(userRequest, `${baseUrl}/home/friends`, json => {
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

    await getData(userRequest, `${baseUrl}/home/friends`, json => {
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
    await getData(adminRequest, `${baseUrl}/home/friends`, json => {
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

    await getData(adminRequest, `${baseUrl}/home/friends`, json => {
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
    await genericRequest(`${baseUrl}/home`, 'POST', '{ bad: data: is: bad }', fetchResponse => {
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
    await getData(userRequest, `${baseUrl}/home/friends`, json => {
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

    await getData(userRequest, `${baseUrl}/home/friends`, json => {
      expect(json).toEqual(expect.objectContaining({
        home: {
          __version: version.user,
          friends: {
            property1: 'value44',
            property2: 'value55'
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
    await getData(adminRequest, `${baseUrl}/home/friends`, json => {
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

    await getData(adminRequest, `${baseUrl}/home/friends`, json => {
      expect(json).toEqual(expect.objectContaining({
        home: {
          __version: version.admin,
          friends: expect.objectContaining({
            property1: 'value64',
            property2: 'value75'
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

    await getData(userRequest, `${baseUrl}/home/girls`, json => {
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
    
    await getData(adminRequest, `${baseUrl}/home/girls`, json => {
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

  test('empty collections that exist are still returned with doc query, user', async ({ userRequest }) => {
    version.user = await postData(userRequest, `${baseUrl}/home`, {
      version: version.user,
      collections: [{
        collection: 'girls'
      }]
    });

    await getData(userRequest, `${baseUrl}/home/girls`, 204); // should be empty

    await getData(userRequest, `${baseUrl}/home`, json => {
      expect(json).toEqual({
        home: {
          __version: version.user,
          state: expect.any(Object),
          friends: expect.any(Object),
          girls: {}
        }
      });
    });
  });

  test('empty collections that exist are still returned with full query, user', async ({ userRequest }) => {
    version.user = await postData(userRequest, `${baseUrl}/home`, {
      version: version.user,
      collections: [{
        collection: 'girls'
      }]
    });

    await getData(userRequest, `${baseUrl}/home/girls`, 204); // should be empty

    await getData(userRequest, `${baseUrl}`, json => {
      expect(json).toEqual({
        home: {
          __version: version.user,
          state: expect.any(Object),
          friends: expect.any(Object),
          girls: {}
        }
      });
    });
  });

  test('delete a collection, user', async ({ userRequest }) => {
    await getData(userRequest, `${baseUrl}/home/friends`, json => {
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
    
    await getData(userRequest, `${baseUrl}/home`, json => {
      expect(json).toEqual(expect.objectContaining({
        home: {
          __version: version.user,
          state: expect.any(Object)
        }
      }));
    });
    
    await getData(userRequest, `${baseUrl}/home/friends`, json => {
      expect(json.ok).not.toBeTruthy();
    }, 404);
  });

  test('delete a collection, admin', async ({ adminRequest }) => {
    await getData(adminRequest, `${baseUrl}/home/friends`, json => {
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
    
    await getData(adminRequest, `${baseUrl}/home`, json => {
      expect(json).toEqual(expect.objectContaining({
        home: {
          __version: version.admin,
          state: expect.any(Object)
        }
      }));
    });
    
    await getData(adminRequest, `${baseUrl}/home/friends`, json => {
      expect(json.ok).not.toBeTruthy();
    }, 404);
  });

  test('delete the home document entirely', async ({ userRequest, adminRequest }) => {
    await deleteHomeDocument([
      [userRequest, baseUrl, 'user'],
      [adminRequest, baseUrl, 'admin']
    ]);
  });
});
