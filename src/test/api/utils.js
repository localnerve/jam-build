/**
 * test utils
 * 
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */
import { expect } from '../fixtures.js';
import {
  getData,
  deleteData
} from './api.js';

/**
 * Delete the home document for accounts.
 * 
 * @param {Array<Array>} requests - Array of triples of [APIRequestContext, baseUrl, accountType] for each account
 * @param {Boolean} [deleteCanFail] - true if the delete can fail
 */
export async function deleteHomeDocument (requests, deleteCanFail = false) {
  const version = {};

  try {
    for (const [request, url, accountType] of requests) {
      await getData(request, `${url}/home`, json => {
        expect(json).toEqual(expect.objectContaining({
          home: expect.any(Object)
        }));
        expect(json.home.__version).toEqual(expect.any(String));
        version[accountType] = json.home.__version;
      }, 200);

      version[accountType] = await deleteData(request, `${url}/home`, {
        deleteDocument: true,
        version: version[accountType]
      });
    }
  } catch (error) {
    if (!deleteCanFail) {
      throw error;
    }
  }

  // regardless, home doc must not exist
  for (const [request, url, ] of requests) {
    await getData(request, `${url}/home`, 404);
  }

  return version;
}
