/**
 * Page data mutation tests.
 * 
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */
import { test, expect } from '../fixtures.js';
import { manualLogin, manualLogout } from '../login.utils.js';
import {
  createTestDataApp,
  createTestDataUser,
  deleteTestDataApp,
  deleteTestDataUser
} from '../testdata.js';
import { startJS, stopJS, createMap, createReport } from '../coverage.js';

test.describe('data mutation tests', () => {
  let baseUrl;
  let map;
  let needLogout;

  /**
   * Do mutations on a refernce to an editable-object control.
   * Assumes input data presets from testdata.js
   * 
   * By default:
   * Update property1, property2
   * Delete property3, property4
   * Create property5
   * 
   * @param {EditableObjectControl} control - The editable-object control to operate on
   * @param {Object} [mutations] - The creates, updates, and deletes to do
   * @param {Array<Array>} [mutations.doCreates] - Array of [name, value] pairs to create
   * @param {Array<String>} [mutations.doUpdates] - Array of property names to update (values are always increment the lastchar)
   * @param {Array<String>} [mutations.doDeletes] - Array of property names to delete
   * @param {Number} [mutations.deletePosition] - The position in the property array to start consecutive delets from
   * @returns {Object} of updateProps, createProps, and deleteProps
   */
  async function doMutations (control, {
    doCreates = [ ['property5', 'value55'] ],
    doUpdates = ['property1', 'property2'],
    doDeletes = ['property3', 'property4'],
    deletePosition = 2
  } = {}) {
    /**
     * Updates
     */
    let lastProp;
    const updateProps = doUpdates.reduce((acc, cur) => {
      acc[cur] = null;
      return acc;
    }, {});
    for (const propName of Object.keys(updateProps)) {
      lastProp = control.getByLabel(propName);
      
      const value = await lastProp.inputValue();
      const newValue = `${value}${value.charAt(value.length - 1)}`;
      updateProps[propName] = newValue;

      await lastProp.dblclick(); // set to edit mode
      await lastProp.fill(newValue);
      await lastProp.press('Enter');
    }

    // assist any visual debugging
    await lastProp.scrollIntoViewIfNeeded();

    // mutationQueue 67ms, plus let heartbeat run once
    await new Promise(res => setTimeout(res, 667)); // increase this to visually debug

    /**
     * Delete props
     */
    const deleteProps = doDeletes;
    for (const propName of deleteProps) {
      const prop = control.getByLabel(propName);
      // * not sure why I have to click before this, but I do. probably visibility in the control...
      await prop.click();

      const propLI = (await control.getByRole('listitem').all())[deletePosition];
      await propLI.getByTitle('Remove').click();
    }

    // mutationQueue 67ms, plus let heartbeat run once
    await new Promise(res => setTimeout(res, 667)); // increase this to visually debug

    /**
     * Create props
     */
    const createProps = doCreates.reduce((acc, [name, value]) => {
      acc[name] = value;
      return acc;
    }, {});
    for (const [newPropName, newPropValue] of Object.entries(createProps)) {
      const newProp = control.getByLabel('New Property and Value');
      await newProp.fill(`${newPropName}:${newPropValue}`);
      await newProp.press('Enter');
    }

    // mutationQueue 67ms, plus let heartbeat run once
    await new Promise(res => setTimeout(res, 667)); // increase this to visually debug

    return {
      updateProps,
      createProps,
      deleteProps
    };
  }

  /**
   * Verify the mutations from doMutations were successful at this moment.
   */
  async function testMutations (page, control, mutations, messageExists = false) {
    // Check for an app message.
    const message = page.locator('.pp-message');
    if (!messageExists) {
      await expect(message).toBeHidden();
    } else {
      await expect(message).toBeVisible();
    }

    // Test updates
    for (const [propName, propValue] of Object.entries(mutations.updateProps)) {
      await expect(control.getByLabel(propName)).toHaveValue(propValue);
    }

    // Test creates
    for (const [propName, propValue] of Object.entries(mutations.createProps)) {
      await expect(control.getByLabel(propName)).toHaveValue(propValue);
    }

    // Test deletes
    for (const propName of mutations.deleteProps) {
      await expect(control.locator(`input[name="${propName}"]`)).toHaveCount(0);
    }
  }

  test.beforeAll(() => {
    baseUrl = process.env.BASE_URL;
    map = createMap();
  });

  test.beforeEach(async ({ page, adminRequest, userRequest }) => {
    await startJS(page);
    await createTestDataApp(baseUrl, adminRequest);
    await createTestDataUser(baseUrl, userRequest);
    await manualLogin(baseUrl, page);
    needLogout = true;
  });

  test.afterEach(async ({ page, adminRequest, userRequest }) => {
    if (needLogout) {
      await manualLogout(baseUrl, page);
    }
    await deleteTestDataApp(baseUrl, adminRequest);
    await deleteTestDataUser(baseUrl, userRequest);
    await stopJS(page, map);
  });

  /* eslint-disable-next-line no-empty-pattern */
  test.afterAll(async ({}, testInfo) => {
    await createReport(map, testInfo);
  });

  /* eslint-disable-next-line playwright/expect-expect */
  test('mutations, navigation batch terminus', async ({ page }, testInfo) => {
    test.setTimeout(testInfo.timeout + 20000);

    let userStateControl = page.locator('#user-home-state');
    const mutations = await doMutations(userStateControl);

    // navigate to About to kill the heartbeat to force the batchUpdate
    const abouts = await page.getByLabel('About').all();
    await abouts[1].click();

    // Let it cook
    await new Promise(res => setTimeout(res, 1000));

    // navigate back, check for stale message
    const homes = await page.getByLabel('Home').all();
    await homes[1].click();

    // Wait for a few milliseconds
    await new Promise(res => setTimeout(res, 100)); // update this to visually debug

    userStateControl = page.locator('#user-home-state');
    await testMutations(page, userStateControl, mutations);
  });

  /* eslint-disable-next-line playwright/expect-expect */
  test('mutations, logout batch terminus', async ({ page }, testInfo) => {
    test.setTimeout(testInfo.timeout + 20000);

    let userStateControl = page.locator('#user-home-state');
    const mutations = await doMutations(userStateControl);

    // logout before the batch window expires and force handling
    await manualLogout(baseUrl, page);

    // let it cook
    await new Promise(res => setTimeout(res, 1000));

    // login to verify the changes 
    await manualLogin(baseUrl, page);

    userStateControl = page.locator('#user-home-state');
    await testMutations(page, userStateControl, mutations);
  });

  /* eslint-disable-next-line playwright/expect-expect */
  test('mutations, inactivity batch terminus', async ({ page }, testInfo) => {
    test.setTimeout(testInfo.timeout + 20000);

    let userStateControl = page.locator('#user-home-state');
    const mutations = await doMutations(userStateControl);

    // inactivity 8000 +
    await new Promise(res => setTimeout(res, 8500)); // increase this to visually debug

    // refresh Home
    const homes = await page.getByLabel('Home').all();
    await homes[1].click();

    userStateControl = page.locator('#user-home-state');
    await testMutations(page, userStateControl, mutations);
  });

  /* eslint-disable-next-line playwright/expect-expect */
  test('mutations, close page batch terminus', async ({ browser }, testInfo) => {
    test.setTimeout(testInfo.timeout + 20000);

    let context = await browser.newContext();
    let page = await context.newPage();

    await manualLogin(baseUrl, page);

    let userStateControl = page.locator('#user-home-state');
    const mutations = await doMutations(userStateControl);

    // trigger batch execution
    await stopJS(page, map);
    await page.close();

    // let it cook
    await new Promise(res => setTimeout(res, 1000)); // increase this to visually debug

    await context.close();
    context = await browser.newContext();
    page = await context.newPage();
    await startJS(page);

    await manualLogin(baseUrl, page);

    // await new Promise(res => setTimeout(res, 8000)); // increase this to visually debug

    userStateControl = page.locator('#user-home-state');
    await testMutations(page, userStateControl, mutations);

    await manualLogout(baseUrl, page);
    await stopJS(page, map);
  
    await context.close();
  });

  test('mutations offline', async ({ browser, browserName }, testInfo) => {
    // we can only test this with chromium
    testInfo.skip(browserName !== 'chromium', 'Offline emulation is only supported in playwright.dev chromium browser');

    // must be run properly, too
    // This allows route to abort service worker requests
    expect(process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS).toBeTruthy();

    test.setTimeout(testInfo.timeout + 20000);

    const context = await browser.newContext();
    const page = await context.newPage();
    await startJS(page);

    await manualLogin(baseUrl, page);
    
    // TODO: fix this. This should not be required.
    await page.goto(baseUrl);

    // go offline, make offline mutations, save mutations
    context.route('**', route => route.abort());
    const userStateControl = page.locator('#user-home-state');
    const mutations = await doMutations(userStateControl);
    await testMutations(page, userStateControl, mutations);

    // Test offline reload
    await page.goto(baseUrl);
    await testMutations(page, userStateControl, mutations, true);

    // go online
    context.unroute('**');

    // artifically force replay like a 'sync' message
    await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready;
      reg.active.postMessage({
        action: '__forceReplay__'
      });
    });

    // wait for sync
    await new Promise(res => setTimeout(res, 2000)); // increase this to visually debug

    // Verify
    await testMutations(page, userStateControl, mutations);

    // await new Promise(res => setTimeout(res, 5000)); // increase this to visually debug
    await stopJS(page, map);
    await context.close();
  });

  test('mutations with simple version conflict', async ({ browser }, testInfo) => {
    test.setTimeout(testInfo.timeout + 20000);

    const context1 = await browser.newContext();
    const page1 = await context1.newPage();
    await startJS(page1);

    await manualLogin(baseUrl, page1);
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
    await startJS(page2);
    await manualLogin(baseUrl, page2);
    const userStateControl2 = page2.locator('#user-home-state');
    const mutations2 = await doMutations(userStateControl2, {
      doUpdates: ['property2', 'property3'],
      doCreates: [ ['property6', 'value66'] ],
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

    // force page1 to update
    let abouts = await page1.getByLabel('About').all();
    await abouts[1].click();
    await new Promise(res => setTimeout(res, 1000));
    let homes = await page1.getByLabel('Home').all();
    await homes[1].click();

    await new Promise(res => setTimeout(res, 1000));
    object1 = await page1.evaluate(() => document.getElementById('user-home-state').object); // eslint-disable-line no-undef

    // then page2 to reconcile with 11,22,55
    abouts = await page2.getByLabel('About').all();
    await abouts[1].click();
    await new Promise(res => setTimeout(res, 1000));
    homes = await page2.getByLabel('Home').all();
    await homes[1].click();

    await new Promise(res => setTimeout(res, 1000));
    object2 = await page2.evaluate(() => document.getElementById('user-home-state').object); // eslint-disable-line no-undef

    // merge result should be:
    const mergeResult = {
      property2: 'value22',
      property3: 'value33',
      property5: 'value55',
      property6: 'value66'
    };

    expect(object1).toEqual(expected1);
    expect(object2).toEqual(mergeResult);

    // force page1 to reconcile
    abouts = await page1.getByLabel('About').all();
    await abouts[1].click();
    await new Promise(res => setTimeout(res, 1000));
    homes = await page1.getByLabel('Home').all();
    await homes[1].click();

    await new Promise(res => setTimeout(res, 1000));
    object1 = await page1.evaluate(() => document.getElementById('user-home-state').object); // eslint-disable-line no-undef

    expect(object1).toEqual(mergeResult);

    await stopJS(page2, map);
    await stopJS(page1, map);
    context1.close();
    context2.close();
  });

});