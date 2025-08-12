/**
 * test utils
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
import { expect } from '#test/fixtures.js';
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
