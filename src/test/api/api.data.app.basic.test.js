/**
 * Endpoint tests for api/data/app
 * 
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */
import { test } from '../fixtures.js';
import { basicEndpointTests } from './endpoint.js';

// eslint-disable-next-line playwright/valid-describe-callback
test.describe('/api/data/app basic tests', basicEndpointTests('/api/data/app', 403, false));