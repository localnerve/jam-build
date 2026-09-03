/**
 * Build utility functions.
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
import path from 'node:path';

/**
 * Generate the version - build timestamp string.
 *
 * @param {String} appVersion - The application version string
 * @returns {String} The version and build time as a string
 */
export function getVersionBuildstamp (appVersion) {
  return `${appVersion}-${(new Date()).toISOString()}`;
}

/**
 * Colorized console logger.
 *
 * @param {string} owner - The plugin/function/owner name, the named source
 * @param {string} message - The log message
 * @param {'log'|'error'|'warn'} [method='log'] - console method to use
 * @param {import('vinyl')|string} [file=null] - Vinyl file object or file/path string
 */
export function log (owner, message, method = 'log', file = null) {
  const colors = {
    magenta: '\x1b[35m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    reset: '\x1b[0m'
  };
  let filepath;
  if (file) {
    filepath = path.relative(process.cwd(), file?.path ?? file);
  }
  const now = new Date();
  const TN = i => i < 10 ? `0${i}` : i;
  const timestring = `${TN(now.getHours())}:${TN(now.getMinutes())}:${TN(now.getSeconds())}`;

  // eslint-disable-next-line no-console
  console[method](
    `[${colors.magenta}${timestring}${colors.reset}] ${owner}: ${method === 'log' ? colors.green : colors.red}${filepath ? `File ${filepath} - ` : ''}${colors.yellow}${message}${colors.reset}`
  );
}
