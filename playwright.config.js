/**
 * Playwright.dev config.
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
import { devices, defineConfig } from '@playwright/test';
const desktopViewport = {
  width: 1440,
  height: 900
};

const slowMo = parseInt((process.env.SLOWMO || '0').toString(), 10);

export default defineConfig({
  testDir: 'src/test',
  timeout: 5000,
  globalSetup: path.resolve('./src/test/globals.js'),
  projects: [{
    name: "localdata",
    testMatch: /_createlocaldata(?:app|user)\.js/
  }, {
    name: "localdata-app",
    testMatch: /_createlocaldataapp\.js/
  }, {
    name: "deletelocaldata",
    testMatch: /_deletelocaldata(?:app|user)\.js/
  }, {
    name: "dummy",
    testMatch: /dummy\.test\.js/
  }, {
    name: 'fixtures',
    testMatch: /fixture\.test\.js/
  }, {
    name: 'api',
    testMatch: 'api/**/*.test.js',
    workers: 6,
    dependencies: ['fixtures']
  }, {
    name: 'api-debug',
    testMatch: 'api/api.data.app.test.js',
    dependencies: ['fixtures']
  }, {
    name: 'pages',
    testMatch: 'pages/**/*.test.js'
  }, {
    name: 'performance',
    testMatch: 'pages/lighthouse.test.js',
    dependencies: ['fixtures']
  }, {
    name: 'data',
    testMatch: 'data/**/*.test.js',
    workers: 1,
    dependencies: ['fixtures', 'api', 'pages']
  }, {
    name: 'data-debug',
    testMatch: 'data/page.mutation.test.js',
    workers: 1
  }, {
    name: 'Chrome',
    use: {
      slowMo,
      browserName: 'chromium',
      viewport: desktopViewport
    }
  }, {
    name: 'Pixel3Emulate',
    use: {
      slowMo,
      ...devices['Pixel 3']
    }
  }, {
    name: 'Webkit',
    use: {
      slowMo,
      browserName: 'webkit',
      viewport: desktopViewport
    }
  }, {
    name: 'Firefox',
    use: {
      slowMo,
      browserName: 'firefox',
      viewport: desktopViewport
    }
  }]
});
