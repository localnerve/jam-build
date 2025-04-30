/**
 * Basic, repeatable endpoint tests.
 * 
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */
import { test } from '../fixtures.js';
import { getData, postData } from './api.js';

export function basicEndpointTests (endpointPath, statusCode = 404) {
  return () => {
    let baseUrl;
    test.beforeAll(() => {
      baseUrl = `${process.env.BASE_URL}${endpointPath}`;
    });

    test(`public GET ${endpointPath}`, async ({ request }) => {
      await getData(request, baseUrl, statusCode);
    });

    test(`logged in user GET ${endpointPath}`, async ({ userRequest }) => {
      const expectedStatus = /user/i.test(endpointPath) ? 404 : statusCode;
      await getData(userRequest, baseUrl, expectedStatus);
    });

    test(`logged in admin GET ${endpointPath}`, async ({ adminRequest }) => {
      const expectedStatus = /(?:app|user)/i.test(endpointPath) ? 404 : statusCode;
      await getData(adminRequest, baseUrl, expectedStatus);
    });

    test(`public POST ${endpointPath}`, async ({ request }) => {
      await postData(request, baseUrl, {}, {
        expectSuccess: false,
        expectResponse: false,
        assertStatus: statusCode
      });
    });

    test(`logged in user POST ${endpointPath}`, async ({ userRequest }) => {
      const expectedStatus = /user/i.test(endpointPath) ? 404 : statusCode;
      await postData(userRequest, baseUrl, {}, {
        expectSuccess: false,
        expectResponse: false,
        assertStatus: expectedStatus
      });
    });

    test(`logged in admin POST ${endpointPath}`, async ({ adminRequest }) => {
      const expectedStatus = /(?:app|user)/i.test(endpointPath) ? 404 : statusCode;
      await postData(adminRequest, baseUrl, {}, {
        expectSuccess: false,
        expectResponse: false,
        assertStatus: expectedStatus
      });
    });
  };
}