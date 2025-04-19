import { devices } from '@playwright/test';
const desktopViewport = {
  width: 1440,
  height: 900
};

const slowMo = parseInt((process.env.SLOWMO || '0').toString(), 10);

export default {
  testDir: 'src/test',
  timeout: 20000,
  projects: [{
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
};
