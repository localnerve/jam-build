/**
 * Load site-data.json and cache for re-use.
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
import { promises as fs } from 'node:fs';
import path from 'node:path';

let siteData = null;

/**
 * Load the site-data.json as an Object.
 *
 * @param {String} inputDir - The directory with all the content files.
 * @returns {Object} The site data object.
 */
export async function loadSiteData (inputDir) {
  if (siteData) {
    return siteData;
  }
  
  const jsonText = await fs.readFile(
    path.join(inputDir, 'site-data.json'),
    { encoding: 'utf8' }
  );
  siteData = JSON.parse(jsonText);
  return siteData;
}