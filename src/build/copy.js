/**
 * Various copy operations.
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
import { src, dest, through, pipeline } from 'node-build-stream';
import { log } from './utils.js';

/**
 * Copy all files from srcDir to dist, copy favicon assets to dist.
 * 
 * @param {Object} settings - build settings.
 * @param {Array} settings.files - files to copy.
 * @param {String} settings.destDir - root dir for distribution.
 * @param {Object} [settings.options] - options for src().
 * @returns {Promise} Resolves when the copy is complete.
 */
export async function fileCopy (settings) {
  const { destDir, files, options = {} } = settings;
  let count = 0;
  await pipeline(
    src(files, options),
    through(file => { count += 1; return file; }, 'copy'),
    dest(destDir)
  );
  log('build-copy', `copied ${count} file${count === 1 ? '' : 's'} to ${destDir}`);
}

/**
 * Generic directory copy.
 *
 * @param {Object} settings - build settings.
 * @param {String} settings.srcDir - srcDir to copy.
 * @param {String} settings.destDir - destDir to copy.
 * @returns {Promise} Resolves when the copy is complete.
 */
export async function dirCopy (settings) {
  const { srcDir, destDir } = settings;
  let count = 0;
  await pipeline(
    src([`${srcDir}/**/*`]),
    through(file => { count += 1; return file; }, 'copy'),
    dest(destDir)
  );
  log('build-copy', `copied ${count} files from ${srcDir} to ${destDir}`);
}

export default {
  dirCopy,
  fileCopy
};
