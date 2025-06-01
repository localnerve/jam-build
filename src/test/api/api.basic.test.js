/**
 * Tests on the api endpoint.
 * 
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */
import { test } from '../fixtures.js';
import { basicEndpointTests } from './endpoint.js';

// eslint-disable-next-line playwright/valid-describe-callback
test.describe('/api basic tests', basicEndpointTests('/api'));