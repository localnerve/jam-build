/**
 * api/data/app tests
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

test.describe('/api/data/app', () => {
  let baseUrl;
  let version = '0';

  test.beforeAll(() => {
    baseUrl = `${process.env.BASE_URL}/api/data/app`;
  });

  test.beforeEach(async ({ adminRequest }) => {
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

  test.afterEach(async ({ adminRequest }) => {
    const versions = await deleteHomeDocument([
      [adminRequest, baseUrl, 'admin']
    ], true);

    version = versions.admin;
  });

  test('get non-existant route', async ({ adminRequest }) => {
    await getData(adminRequest, `${baseUrl}/nothingbetterbehere`, 404);
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
    for (const requestor of [adminRequest, userRequest, request]) {
      await getData(requestor, baseUrl, json => {
        expect(json).toStrictEqual(expect.objectContaining({
          home: expect.objectContaining({
            __version: expect.any(String)
          })
        }));
        version = json.home.__version;
      });
    }
  });

  test('get application home - all user types', async ({ adminRequest, userRequest, request }) => {
    for (const requestor of [adminRequest, userRequest, request]) {
      await getData(requestor, `${baseUrl}/home`, json => {
        expect(json).toEqual(expect.objectContaining({
          home: expect.objectContaining({
            __version: expect.any(String)
          })
        }));
        version = json.home.__version;
      });
    }
  });

  test('get specific multiple collections', async ({ adminRequest }) => {
    await getData(adminRequest, `${baseUrl}/home?collections=state&collections=friends`, json => {
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

  test('get specific collections, only one, less than the total', async ({ adminRequest }) => {
    await getData(adminRequest, `${baseUrl}/home?collections=friends`, json => {
      expect(json).toEqual({
        home: {
          __version: expect.any(String),
          friends: expect.any(Object)
        }
      });
      version = json.home.__version;
    });
  });

  test('get specific collections, deduplicate', async ({ adminRequest }) => {
    await getData(adminRequest, `${baseUrl}/home?collections=friends&collections=friends`, json => {
      expect(json).toEqual({
        home: {
          __version: expect.any(String),
          friends: expect.any(Object)
        }
      });
      version = json.home.__version;
    });
  });

  test('get include non-existant collections, ignored', async ({ adminRequest }) => {
    await getData(adminRequest, `${baseUrl}/home?collections=friends&collections=nonexistant&collections=`, json => {
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
    await getData(adminRequest, `${baseUrl}/nonexistant`, json => {
      expect(json.ok).not.toBeTruthy();
    }, 404);
  });

  test('get application home/state', async ({ adminRequest }) => {
    await getData(adminRequest, `${baseUrl}/home/state`, json => {
      expect(json).toEqual({
        home: {
          __version: expect.any(String),
          state: expect.any(Object)
        }
      });
      version = json.home.__version;
    });
  });

  test('get non-existing collection', async ({ adminRequest }) => {
    await getData(adminRequest, `${baseUrl}/home/nonexistant`, json => {
      expect(json.ok).not.toBeTruthy();
    }, 404);
  });

  test('get non-existing collections with query string', async ({ adminRequest }) => {
    await getData(adminRequest, `${baseUrl}/home?collections=nonexistant1&collections=nonexistant2`, json => {
      expect(json.ok).not.toBeTruthy();
    }, 404);
  });

  test('mutate a single property', async ({ adminRequest }) => {
    const newValue = 'value45';

    await getData(adminRequest, `${baseUrl}/home/friends`, json => {
      expect(json).toEqual({
        home: {
          __version: expect.any(String),
          friends: expect.objectContaining({
            property2: expect.any(String)
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
          property2: newValue
        }
      }
    });
  
    await getData(adminRequest, `${baseUrl}/home/friends`, json => {
      expect(json).toStrictEqual({
        home: {
          __version: version,
          friends: expect.objectContaining({
            property2: newValue
          })
        }
      });
      version = json.home.__version;
    });
  });

  test('missing a single property does not delete the property', async ({ adminRequest }) => {
    await getData(adminRequest, `${baseUrl}/home/friends`, json => {
      expect(json).toEqual({
        home: {
          __version: expect.any(String),
          friends: expect.objectContaining({
            property3: 'value46'
          })
        }
      });
      version = json.home.__version;
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
    
    await getData(adminRequest, `${baseUrl}/home/friends`, json => {
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
      version = json.home.__version;
    });
  });

  test('bad post with malformed data', async () => {
    await genericRequest(`${baseUrl}/home`, 'POST', '{ bad: data: is: bad }', fetchResponse => {
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
    await getData(adminRequest, `${baseUrl}/home/friends`, json => {
      expect(json).toStrictEqual({
        home: {
          __version: expect.any(String),
          friends: {
            property1: 'value44',
            property2: 'value55',
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

    await getData(adminRequest, `${baseUrl}/home/friends`, json => {
      expect(json).toStrictEqual({
        home: {
          __version: version,
          friends: {
            property1: 'value44',
            property2: 'value55',
            property3: 'value46'
          }
        }
      });
    });
  });

  test('delete a single property', async ({ adminRequest }) => {
    await getData(adminRequest, `${baseUrl}/home/friends`, json => {
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

    await getData(adminRequest, `${baseUrl}/home/friends`, json => {
      expect(json).toEqual({
        home: {
          __version: version,
          friends: expect.objectContaining({
            property1: 'value44',
            property2: 'value55'
          })
        }
      });
      expect(json).not.toEqual({
        home: {
          __version: expect.any(String),
          friends: expect.objectContaining({
            property3: expect.any(String)
          })
        }
      });
    });
  });

  test('empty collections that exist should return 204 with collection query', async ({ adminRequest }) => {
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

    await getData(adminRequest, `${baseUrl}/home/girls`, json => {
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

  test('empty collections that exist are still returned with doc query', async ({ adminRequest }) => {
    version = await postData(adminRequest, `${baseUrl}/home`, {
      version,
      collections: [{
        collection: 'girls'
      }]
    });

    await getData(adminRequest, `${baseUrl}/home/girls`, 204); // should be empty

    await getData(adminRequest, `${baseUrl}/home`, json => {
      expect(json).toEqual({
        home: {
          __version: version,
          state: expect.any(Object),
          friends: expect.any(Object),
          girls: {}
        }
      });
    });
  });

  test('empty collections that exist are still returned with full query', async ({ adminRequest }) => {
    version = await postData(adminRequest, `${baseUrl}/home`, {
      version,
      collections: [{
        collection: 'girls'
      }]
    });

    await getData(adminRequest, `${baseUrl}/home/girls`, 204); // should be empty

    await getData(adminRequest, `${baseUrl}`, json => {
      expect(json).toEqual({
        home: {
          __version: version,
          state: expect.any(Object),
          friends: expect.any(Object),
          girls: {}
        }
      });
    });
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

    await getData(adminRequest, `${baseUrl}/home/empty`, json => {
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

    await getData(adminRequest, `${baseUrl}/home`, json => {
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

    await getData(adminRequest, `${baseUrl}/home`, json => {
      expect(json).toEqual({
        home: expect.not.objectContaining({
          other1: expect.any(Object),
          other2: expect.any(Object)
        })
      });
    });
  });

  test('delete one collection', async ({ adminRequest }) => {
    await getData(adminRequest, `${baseUrl}/home/friends`, json => {
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

    await getData(adminRequest, `${baseUrl}/home`, json => {
      expect(json).toEqual(expect.objectContaining({
        home: {
          __version: version,
          state: expect.any(Object)
        }
      }));
    });

    await getData(adminRequest, `${baseUrl}/home/friends`, json => {
      expect(json.ok).not.toBeTruthy();
    }, 404);
  });

  test('update conflict should cause version error', async ({ adminRequest: admin1, adminRequest: admin2 }) => {
    let payload1, payload2;
    
    await getData(admin1, baseUrl, json => {
      payload1 = json;
    });

    await getData(admin2, baseUrl, json => {
      payload2 = json;
    });

    const newState = {
      item1: 'item1',
      item2: 'item2',
      item3: 'item3',
      item4: 'item4'
    };

    const newVersion = await postData(admin2, `${baseUrl}/home`, {
      version: payload2.home.__version,
      collections: [{
        collection: 'state',
        properties: newState
      }]
    });

    expect(newVersion).not.toEqual(payload1.home.__version);

    newState.item3 = 'item33';

    await postData(admin1, `${baseUrl}/home`, {
      version: payload1.home.__version,
      collections: [{
        collection: 'state',
        properties: newState
      }]
    }, {
      expectSuccess: false,
      expectResponseSuccess: false,
      assertStatus: 409,
      expectVersionError: true
    });
  });

  test('delete conflict should cause version error', async ({ adminRequest: admin1, adminRequest: admin2 }) => {
    let payload1, payload2;
    
    await getData(admin1, baseUrl, json => {
      payload1 = json;
    });

    await getData(admin2, baseUrl, json => {
      payload2 = json;
    });

    const newState = {
      item1: 'item1',
      item2: 'item2',
      item3: 'item3',
      item4: 'item4'
    };

    const newVersion = await postData(admin2, `${baseUrl}/home`, {
      version: payload2.home.__version,
      collections: [{
        collection: 'state',
        properties: newState
      }]
    });

    expect(newVersion).not.toEqual(payload1.home.__version);

    await deleteData(admin1, `${baseUrl}/home/state`, {
      version: payload1.home.__version
    }, {
      expectSuccess: false,
      assertStatus: 409,
      expectVersionError: true
    });

  });

  test('delete the home document entirely', async ({ adminRequest }) => {
    await getData(adminRequest, `${baseUrl}/home`, json => {
      expect(json).toEqual(expect.objectContaining({
        home: expect.objectContaining({
          __version: version
        })
      }));
    });

    await deleteHomeDocument([
      [adminRequest, baseUrl, 'admin']
    ]);
  });
});
