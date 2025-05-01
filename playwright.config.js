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
    name: 'fixtures',
    use: {
      browserName: 'chromium'
    },
    testMatch: /fixture\.test\.js/
  }, {
    name: 'api',
    use: {
      browserName: 'chromium'
    },
    testMatch: 'api/**/*.test.js',
    dependencies: ['fixtures']
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
