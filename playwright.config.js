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
    dependencies: ['fixtures']
  }, {
    name: 'api-debug',
    testMatch: 'api/api.data.app.test.js',
    dependencies: ['fixtures']
  }, {
    name: 'pages',
    testMatch: 'pages/**/*.test.js',
    dependencies: ['fixtures', 'api']
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
