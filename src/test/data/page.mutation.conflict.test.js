/**
 * Page data mutation conflict tests.
 * Multi-page tests proving exponential backoff with jitter
 * resolves the batch-loop-conflict problem.
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
import debugLib from '@localnerve/debug';
import { test, expect } from '#test/fixtures.js';
import {
  manualLogin,
  manualLogout,
  serviceTimeout
} from '#test/login.utils.js';
import {
  createTestDataApp,
  createTestDataUser,
  deleteTestDataApp,
  deleteTestDataUser
} from '#test/testdata.js';
import { startJS, stopJS, createMap, createReport } from '#test/coverage.js';
import {
  doMutations,
  testMutations,
  slowTimeoutAddition,
  forceBatchTerminusNav
} from '#test/data.utils.js';
import {
  conflictMaxRetries,
  conflictBackoffBase,
  conflictBackoffMax
} from '#client-utils/constants.js';

const debug = debugLib('test:data:conflict');

test.describe('conflict resolution tests', () => {
  let baseUrl;
  let map;
  let needLogout;
  let activeClickWait;

  const clickWait = 400;

  /**
   * Create three authenticated, concurrent browser contexts and pages for each.
   * 
   * @param {Browser} browser - The built-in playwright Browser fixture
   * @param {String} browserName - The built-in playwright browserName fixture
   * @returns {Object} browsing contexts and pages for clients A, B, and C
   */
  async function startThreeClients (browser, browserName) {
    // Page A: login and mutate property1, property2
    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    await startJS(browserName, pageA);
    await manualLogin(baseUrl, pageA);
    await new Promise(res => setTimeout(res, clickWait));

    const controlA = pageA.locator('#user-home-state');
    const mutationsA = await doMutations(controlA, {
      doUpdates: ['property1'],
      doCreates: [['propertyA', 'valueA']],
      doDeletes: [],
      deletePosition: 0
    });
    await testMutations(pageA, controlA, mutationsA);

    // Page B: login and mutate property2, property3
    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    await startJS(browserName, pageB);
    await manualLogin(baseUrl, pageB);
    await new Promise(res => setTimeout(res, clickWait));

    const controlB = pageB.locator('#user-home-state');
    const mutationsB = await doMutations(controlB, {
      doUpdates: ['property2'],
      doCreates: [['propertyB', 'valueB']],
      doDeletes: [],
      deletePosition: 0
    });
    await testMutations(pageB, controlB, mutationsB);

    // Page C: login and mutate property3, property4
    const contextC = await browser.newContext();
    const pageC = await contextC.newPage();
    await startJS(browserName, pageC);
    await manualLogin(baseUrl, pageC);
    await new Promise(res => setTimeout(res, clickWait));

    const controlC = pageC.locator('#user-home-state');
    const mutationsC = await doMutations(controlC, {
      doUpdates: ['property3'],
      doCreates: [['propertyC', 'valueC']],
      doDeletes: [],
      deletePosition: 0
    });
    await testMutations(pageC, controlC, mutationsC);

    return {
      contextA,
      pageA,
      contextB,
      pageB,
      contextC,
      pageC
    };
  }

  /**
   * Destroy three authenticated, concurrent browser contexts and pages for each.
   *
   * @param {String} browserName - The built-in playwright browserName fixture
   * @param {Object} clients - browsing contexts and pages for clients A, B, and C
   * @param {BrowserContext} clients.contextA - BrowserContext for client A
   * @param {Page} clients.pageA - Page for client A
   * @param {BrowserContext} clients.contextB - BrowserContext for client B
   * @param {Page} clients.pageB - Page for client B
   * @param {BrowserContext} clients.contextC - BrowserContext for client C
   * @param {Page} clients.pageC - Page for client C
   */
  async function stopThreeClients (browserName, {
    contextA, contextB, contextC, pageA, pageB, pageC
  }) {
    await stopJS(browserName, pageC, map);
    await stopJS(browserName, pageB, map);
    await stopJS(browserName, pageA, map);
    contextC.close();
    contextB.close();
    contextA.close();
  }

  test.beforeAll(() => {
    baseUrl = process.env.BASE_URL;
    map = createMap();
  });

  test.beforeEach(async ({ browserName, page, adminRequest, userRequest }, testInfo) => {
    if (testInfo.timeout < serviceTimeout) {
      test.setTimeout(serviceTimeout);
    }

    // const notChrome = page.context().browser().browserType().name() !== 'chromium';
    activeClickWait = process.env.CI ? 1200 : clickWait;

    await startJS(browserName, page);
    await createTestDataApp(baseUrl, adminRequest);
    await createTestDataUser(baseUrl, userRequest);
    await manualLogin(baseUrl, page);
    
    needLogout = true;
  });

  test.afterEach(async ({ browserName, page, adminRequest, userRequest }, testInfo) => {
    if (needLogout) {
      if (testInfo.timeout < serviceTimeout) {
        test.setTimeout(serviceTimeout);
      }
      await manualLogout(baseUrl, page);
    }
    await deleteTestDataApp(baseUrl, adminRequest);
    await deleteTestDataUser(baseUrl, userRequest);
    await stopJS(browserName, page, map);
  });

  /* eslint-disable-next-line no-empty-pattern */
  test.afterAll(async ({ }, testInfo) => {
    await createReport(map, testInfo);
  });

  // This is essentially 'simple version conflict'
  test('concurrent conflict resolution', async ({ browserName, browser }, testInfo) => {
    test.setTimeout(testInfo.timeout + slowTimeoutAddition);

    const context1 = await browser.newContext();
    const page1 = await context1.newPage();
    await startJS(browserName, page1);
    await manualLogin(baseUrl, page1);
    await new Promise(res => setTimeout(res, activeClickWait));

    const userStateControl1 = page1.locator('#user-home-state');
    const mutations1 = await doMutations(userStateControl1);
    await testMutations(page1, userStateControl1, mutations1);

    const expected1 = {
      property1: 'value11',
      property2: 'value22',
      property5: 'value55'
    };
    let object1 = await page1.evaluate(() => document.getElementById('user-home-state').object); // eslint-disable-line no-undef
    expect(object1).toEqual(expected1);

    const context2 = await browser.newContext();
    const page2 = await context2.newPage();
    await startJS(browserName, page2);
    await manualLogin(baseUrl, page2);
    await new Promise(res => setTimeout(res, activeClickWait));

    const userStateControl2 = page2.locator('#user-home-state');
    await expect(userStateControl2.getByLabel('property3')).toBeVisible({ timeout: 5000 });
    const mutations2 = await doMutations(userStateControl2, {
      doUpdates: ['property2', 'property3'],
      doCreates: [['property6', 'value66']],
      doDeletes: ['property1'],
      deletePosition: 0
    });
    await testMutations(page2, userStateControl2, mutations2);

    const expected2 = {
      property2: 'value22',
      property3: 'value33',
      property4: 'value4',
      property6: 'value66'
    };
    let object2 = await page2.evaluate(() => document.getElementById('user-home-state').object); // eslint-disable-line no-undef
    expect(object2).toEqual(expected2);

    // Force page 1 to batch (no conflict yet, it's first)
    await forceBatchTerminusNav(page1, 'About', baseUrl, activeClickWait);

    // Force page 2 to batch (will conflict with page 1's changes, triggers conflict)
    await forceBatchTerminusNav(page2, 'About', baseUrl, activeClickWait);

    // Settle
    await new Promise(res => setTimeout(res, 1000));

    // The merge result incorporating both: local (page2) preferred when conflicting with remote (page1)
    const mergeResult = {
      property2: 'value22',
      property3: 'value33',
      property5: 'value55',
      property6: 'value66'
    };
    object2 = await page2.evaluate(() => document.getElementById('user-home-state').object); // eslint-disable-line no-undef
    expect(object2).toEqual(mergeResult);

    // Force page 1 to reconcile by refreshing
    await forceBatchTerminusNav(page1, 'About', baseUrl, activeClickWait);
    object1 = await page1.evaluate(() => document.getElementById('user-home-state').object); // eslint-disable-line no-undef
    expect(object1).toEqual(mergeResult);

    await stopJS(browserName, page2, map);
    await stopJS(browserName, page1, map);
    context2.close();
    context1.close();
  });

  // This test will occasionally work to exercise the backoff for pageC
  test('cascading conflict, three clients', async ({ browserName, browser }, testInfo) => {
    test.setTimeout(testInfo.timeout + slowTimeoutAddition);

    const settleWait = process.env.CI ? 6000 : 2000; // eslint-disable-line playwright/no-conditional-in-test

    const clients = await startThreeClients(browser, browserName);
    const { pageA, pageB, pageC } = clients;

    // Fire batch terminus in rapid succession on all three pages
    await forceBatchTerminusNav(pageA, 'About', baseUrl, activeClickWait);
    await forceBatchTerminusNav(pageB, 'About', baseUrl, activeClickWait);
    await forceBatchTerminusNav(pageC, 'About', baseUrl, activeClickWait);

    // Allow backoff delays to settle
    await new Promise(res => setTimeout(res, settleWait));

    // Refresh all pages to get final state
    await forceBatchTerminusNav(pageA, 'About', baseUrl, activeClickWait);
    await forceBatchTerminusNav(pageB, 'About', baseUrl, activeClickWait);
    await forceBatchTerminusNav(pageC, 'About', baseUrl, activeClickWait);

    await new Promise(res => setTimeout(res, settleWait));

    // All pages need to converge to the same state
    const objectA = await pageA.evaluate(() => document.getElementById('user-home-state').object); // eslint-disable-line no-undef
    const objectB = await pageB.evaluate(() => document.getElementById('user-home-state').object); // eslint-disable-line no-undef
    const objectC = await pageC.evaluate(() => document.getElementById('user-home-state').object); // eslint-disable-line no-undef

    // All three pages must agree on the final state
    expect(objectA).toEqual(objectB);
    expect(objectB).toEqual(objectC);

    // The merged state must contain all the new properties (none conflicted)
    expect(objectA).toHaveProperty('propertyA', 'valueA');
    expect(objectA).toHaveProperty('propertyB', 'valueB');
    expect(objectA).toHaveProperty('propertyC', 'valueC');

    await stopThreeClients(browserName, clients);
  });

  // This test will ALWAYS work to exercise the backoff for pageC
  test('cascading conflict, three clients, force backoff', async ({ browserName, browser }, testInfo) => {
    testInfo.skip(browser.browserType().name() !== 'chromium',
      'Route interception for service worker requests requires chromium');
    expect(process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS).toBeTruthy();

    const delayPadding = process.env.CI ? 6000 : 3200; // eslint-disable-line  playwright/no-conditional-in-test

    test.setTimeout(testInfo.timeout + slowTimeoutAddition);

    const clients = await startThreeClients(browser, browserName);
    const { contextC, pageA, pageB, pageC } = clients;

    // Force pageA first, then pageB (pageB will conflict)
    await forceBatchTerminusNav(pageA, 'About', baseUrl, activeClickWait);
    await forceBatchTerminusNav(pageB, 'About', baseUrl, activeClickWait);

    let mutationCount = 0;
    const mutationMax = conflictMaxRetries - 2;
    const userDataRoute = '**/api/data/user/**';
  
    // Intercept POST /api/data/user/* to always return versionError
    // This forces repeated conflicts that will force the backoff behavior
    await contextC.route(userDataRoute, async route => {
      const request = route.request();
      const mutation = request.method() === 'POST' || request.method() === 'DELETE';

      if (mutation && mutationCount < mutationMax) {
        mutationCount++;
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({
            ok: false,
            versionError: true,
            message: 'Version conflict'
          })
        });
      } else {
        if (mutation) {
          mutationCount++;
        }
        await route.continue();
      }
    });

    // Force pageC batch update, start conflict exponential backoff
    await forceBatchTerminusNav(pageC, 'About', baseUrl, activeClickWait);

    // Get last delay and wait for the conflicts to transpire
    let lastDelay = Math.min(
      conflictBackoffBase * Math.pow(2, mutationMax),
      conflictBackoffMax
    );
    lastDelay += Math.random() * lastDelay;
    lastDelay += delayPadding;
    debug(`Waiting ${lastDelay}ms for backoff...`);
    await new Promise(res => setTimeout(res, lastDelay));

    await contextC.unroute(userDataRoute);

    // Refresh all pages to get final state
    await forceBatchTerminusNav(pageA, 'About', baseUrl, activeClickWait);
    await forceBatchTerminusNav(pageB, 'About', baseUrl, activeClickWait);
    await forceBatchTerminusNav(pageC, 'About', baseUrl, activeClickWait);
    await new Promise(res => setTimeout(res, 1000 + delayPadding));

    // All pages need to converge to the same state
    const objectA = await pageA.evaluate(() => document.getElementById('user-home-state').object); // eslint-disable-line no-undef
    const objectB = await pageB.evaluate(() => document.getElementById('user-home-state').object); // eslint-disable-line no-undef
    const objectC = await pageC.evaluate(() => document.getElementById('user-home-state').object); // eslint-disable-line no-undef

    // All three pages must agree on the final state
    expect(objectA).toEqual(objectB);
    expect(objectB).toEqual(objectC);

    // The merged state must contain all the new properties (none conflicted)
    expect(objectA).toHaveProperty('propertyA', 'valueA');
    expect(objectA).toHaveProperty('propertyB', 'valueB');
    expect(objectA).toHaveProperty('propertyC', 'valueC');

    await stopThreeClients(browserName, clients);
  });

  test('backoff max retries exceeded shows error message', async ({ browserName, browser }, testInfo) => {
    testInfo.skip(browser.browserType().name() !== 'chromium',
      'Route interception for service worker requests requires chromium');
    expect(process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS).toBeTruthy();

    const maxRetriesWait = conflictMaxRetries * conflictBackoffMax;
    const testTimeout = Math.max(testInfo.timeout + slowTimeoutAddition, maxRetriesWait);
    test.setTimeout(testTimeout + slowTimeoutAddition);

    // Page 1: login and mutate to create a version on the server
    const context1 = await browser.newContext();
    const page1 = await context1.newPage();
    await startJS(browserName, page1);
    await manualLogin(baseUrl, page1);
    await new Promise(res => setTimeout(res, activeClickWait));

    const userStateControl1 = page1.locator('#user-home-state');
    await doMutations(userStateControl1, {
      doUpdates: ['property1'],
      doCreates: [],
      doDeletes: [],
      deletePosition: 0
    });

    // Commit page 1's changes
    await forceBatchTerminusNav(page1, 'About', baseUrl, activeClickWait);

    // Page 2: login (will have stale version), set up interception
    const context2 = await browser.newContext();
    const page2 = await context2.newPage();
    await startJS(browserName, page2);
    await manualLogin(baseUrl, page2);
    await new Promise(res => setTimeout(res, activeClickWait));

    // ALWAYS Intercept POST /api/data/user/* to always return versionError
    // This forces repeated conflicts that will exhaust the retry limit
    await context2.route('**/api/data/user/**', async route => {
      const request = route.request();
      if (request.method() === 'POST') {
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({
            ok: false,
            versionError: true,
            message: 'Version conflict'
          })
        });
      } else {
        await route.continue();
      }
    });

    // Make mutations on page 2
    const userStateControl2 = page2.locator('#user-home-state');
    await expect(userStateControl2.getByLabel('property3')).toBeVisible({ timeout: 5000 });
    await doMutations(userStateControl2, {
      doUpdates: ['property2'],
      doCreates: [],
      doDeletes: [],
      deletePosition: 0
    });

    // Force batch on page 2 - every POST will be rejected with versionError,
    // triggering repeated conflict resolution until max retries exceeded
    await forceBatchTerminusNav(page2, 'About', baseUrl, activeClickWait);

    // Listen for the error message from the service worker
    /* eslint-disable no-undef */
    await page2.evaluate(() => {
      window.__conflictError = null;
      navigator.serviceWorker.addEventListener('message', event => {
        const payload = event?.data?.payload;
        if (payload?.message?.class === 'error' &&
          payload?.message?.text?.includes('could not be resolved')) {
          window.__conflictError = payload.message.text;
        }
      });
    });
    /* eslint-enable no-undef */

    // Wait for backoff iterations and max retries to exhaust
    // With base=100ms, max=8000ms, 7 retries: worst case ~56s total
    await new Promise(res => setTimeout(res, maxRetriesWait));

    // Check that the error message was received via service worker message
    const errorText = await page2.evaluate(() => window.__conflictError); // eslint-disable-line no-undef
    expect(errorText).toBeTruthy();
    expect(errorText).toContain('could not be resolved');

    // Cleanup route interception
    await context2.unroute('**/api/data/user/**');

    await stopJS(browserName, page2, map);
    await stopJS(browserName, page1, map);
    context2.close();
    context1.close();
  });
});
