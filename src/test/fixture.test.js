/**
 * A check project to exercise the fixtures
 * 
 */
import debugLib from 'debug';
import { expect, test } from './fixtures.js';

const debug = debugLib('test:check');

test.describe('Fixture check', () => {
  test('Audit APIRequestContext fixtures', async ({ adminRequest, userRequest }) => {
    const adminState = await adminRequest.storageState();
    const userState = await userRequest.storageState();

    expect(adminState).toBeTruthy();
    expect(userState).toBeTruthy();

    debug('Admin request state', adminState);
    debug('User request state', userState);
  });
});