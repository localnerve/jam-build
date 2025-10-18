/**
 * Build the test container image without playwright.
 * 
 * Required Environment Variables:
 *   AUTHZ_ADMIN_SECRET
 *   DB_DATABASE
 *   DB_USER
 *   DB_APP_USER
 *   DB_PASSWORD
 *   DB_ROOT_PASSWORD
 *   DB_APP_PASSWORD
 *   FORCE_BUILD (must be set)
 * 
 * Run from package.json as `npm run test:build`
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
import setup from './globals.js';

/**
 * Just run the global playwright setup and teardown... without playwright.
 * Run with the env from npm scripts, (re)builds the TestContainer image.
 */
const teardown = await setup();
await teardown();