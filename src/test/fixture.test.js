/**
 * A check project to exercise the fixtures
 * 
 */
import debugLib from 'debug';
import { expect, test } from './fixtures.js';

const debug = debugLib('test:fixture:check');

test.describe('Fixture check', () => {
  test('Audit APIRequestContext fixtures', async ({ adminRequest, userRequest, request }) => {
    const adminState = await adminRequest.storageState();
    const userState = await userRequest.storageState();
    const publicState = await request.storageState();

    expect(adminState.cookies.length).toBeGreaterThan(0);
    expect(userState.cookies.length).toBeGreaterThan(0);
    expect(publicState.cookies.length).toEqual(0);

    debug('Admin request state', adminState);
    debug('User request state', userState);
  });

  test('Audit Page fixtures', async({ adminPage, userPage, page }) => {
    const adminState = await adminPage.context().storageState();
    const userState = await userPage.context().storageState();
    const publicState = await page.context().storageState();

    expect(adminState.cookies.length).toBeGreaterThan(0);
    expect(userState.cookies.length).toBeGreaterThan(0);
    expect(publicState.cookies.length).toEqual(0);

    debug('Admin request state', adminState);
    debug('User request state', userState);
  });
});