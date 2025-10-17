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

const puppeteerOptions = process.env.CI ? {
  args: ['--no-sandbox', '--disable-setuid-sandbox']
}: {};

const slowMo = parseInt((process.env.SLOWMO || '0').toString(), 10);

let bypassCSP = false;
if (process.env.LOCALAPP_URL) {
  try {
    new URL(process.env.LOCALAPP_URL);  // check validity only
    bypassCSP = true;                   // local could be any build result
  } catch (e) {
    throw new Error('LOCALAPP_URL not valid url');
  }
} // bypassCSP NOT required for testcontainers bc the app was build:dev in the docker image

export default defineConfig({
  use: {
    bypassCSP
  },
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
    name: 'fixtures',
    testMatch: /fixture\.test\.js/
  }, {
    name: 'fixtures-firefox',
    use: {
      browserName: 'firefox'
    },
    testMatch: /fixture\.test\.js/
  }, {
    name: 'fixtures-webkit',
    use: {
      browserName: 'webkit'
    },
    testMatch: /fixture\.test\.js/
  }, {
    name: 'api',
    use: {
      launchOptions: {
        ...puppeteerOptions
      }
    },
    testMatch: 'api/**/*.test.js',
    workers: 6,
    dependencies: ['fixtures']
  }, {
    name: 'api-debug',
    testMatch: 'api/api.data.app.test.js',
    dependencies: ['fixtures']
  }, {
    name: 'api-firefox',
    use: {
      browserName: 'firefox'
    },
    testMatch: 'api/**/*.test.js',
    workers: 6,
    dependencies: ['fixtures-firefox']
  }, {
    name: 'api-webkit',
    use: {
      browserName: 'webkit'
    },
    testMatch: 'api/**/*.test.js',
    workers: 6,
    dependencies: ['fixtures-webkit']
  }, {
    name: 'pages',
    use: {
      launchOptions: {
        ...puppeteerOptions
      }
    },
    testMatch: 'pages/**/*.test.js'
  }, {
    name: 'pages-firefox',
    use: {
      browserName: 'firefox'
    },
    testMatch: 'pages/**/*.test.js'
  }, {
    name: 'pages-webkit',
    use: {
      browserName: 'webkit'
    },
    testMatch: 'pages/**/*.test.js'
  }, {
    name: 'performance',
    use: {
      launchOptions: {
        ...puppeteerOptions
      }
    },
    testMatch: 'pages/lighthouse.test.js',
    dependencies: ['fixtures']
  }, {
    name: 'data',
    use: {
      launchOptions: {
        ...puppeteerOptions
      }
    },
    testMatch: 'data/**/*.test.js',
    workers: 1,
    dependencies: ['api', 'pages']
  }, {
    name: 'data-debug',
    testMatch: 'data/page.mutation.test.js',
    workers: 1
  }, {
    name: 'Chromium',
    use: {
      slowMo,
      browserName: 'chromium',
      viewport: desktopViewport,
      launchOptions: {
        ...puppeteerOptions
      }
    },
    testMatch: 'data/**/*.test.js',
    workers: 1,
    dependencies: ['api', 'pages']
  }, {
    name: 'Pixel3Emulate',
    use: {
      slowMo,
      ...devices['Pixel 3'],
      launchOptions: {
        ...puppeteerOptions
      }
    },
    dependencies: ['data']
  }, {
    // This either requires a named, proxied https setup (webkit won't honor secure cookie over http on localhost)
    // Alternatively, run the localnerve authorizer fork on localhost with startup env APP_COOKIE_SECURE=false
    name: 'Webkit',
    use: {
      slowMo,
      browserName: 'webkit',
      viewport: desktopViewport
    },
    testMatch: 'data/**/*.test.js',
    workers: 1,
    dependencies: ['api-webkit', 'pages-webkit']
  }, {
    name: 'Firefox',
    use: {
      slowMo,
      browserName: 'firefox',
      viewport: desktopViewport
    },
    testMatch: 'data/**/*.test.js',
    workers: 1,
    dependencies: ['api-firefox', 'pages-firefox']
  }]
});
