/**
 * Endpoint tests for api/data/user
 * 
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */
import { test } from '../fixtures.js';
import { basicEndpointTests } from './endpoint.js';

test.describe('/api/data/user basic tests', basicEndpointTests('/api/data/user', 403));