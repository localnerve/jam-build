---
Author: Alex Grant <alex@localnerve.com> (https://www.localnerve.com)
Date: August 30, 2025
Title: Jam-Build Testing Procedure
---

# Jam-Build Testing Procedure

This document describes the comprehensive testing architecture and procedures for the Jam-Build reference project.

## Testing Architecture Overview

Jam-Build implements a sophisticated multi-layered testing approach that combines:
- **Dockerized Services**: MariaDB and Authorization services running in Docker Testcontainers
- **Multi-Coverage Collection**: Service worker, main thread, and data service coverage extraction
- **Multi-User Testing**: Role-based test fixtures supporting admin and user contexts
- **Offline-First Testing**: Service worker network interception and offline capability validation

## Quick Links

* 📂 [Test Organization](#test-organization)
* 🔧 [Environment Setup](#environment-setup)
* 📐 [Test Fixtures and Multi-User Support](#test-fixtures-and-multi-user-support)
* ♟ [Coverage Collection Strategy](#coverage-collection-strategy)
* 🏃‍♂️ [Running Tests](#running-tests)
* 🛅 [Test Patterns and Examples](#test-patterns-and-examples)
* ✨ [Advanced Testing Features](#advanced-testing-features)
* 🛟 [Troubleshooting](#troubleshooting)
* 💚 [Coverage Reports](#coverage-reports)

## Test Organization

### Directory Structure At a Glance

Here is a partial description of the files in the test suite to give an understanding of how things are organized.

```
src/test/
├── globals.js           # Playwright global setup with Docker Testcontainers
├── services.js          # Docker service management (MariaDB, Authorizer, App)
├── fixtures.js          # Multi-user authenticated context fixtures
├── coverage.js          # Coverage collection utilities
├── api/                 # Data service API tests
│   ├── api.js          # API testing utilities
│   └── *.test.js       # API endpoint tests
├── pages/              # Basic page structure tests
│   └── *.test.js       # Page functionality tests
└── data/               # Login and data mutation tests
    ├── page.login.test.js      # Authentication flow tests
    └── page.mutation.test.js   # Data synchronization tests
```

### Test Categories

1. **API Tests** (`src/test/api/`): Direct REST API endpoint testing
2. **Page Tests** (`src/test/pages/`): Basic page structure and navigation testing
3. **Data Tests** (`src/test/data/`): End-to-end user interaction and data mutation testing

## Environment Setup

### Docker Testcontainers Architecture

The testing environment uses Docker Testcontainers to create isolated, reproducible test environments:

#### Services Orchestration (`src/test/services.js`)
- **MariaDB Container**: Database service with test schema and procedures
- **Authorizer Container**: Authentication/authorization service (lakhansamani/authorizer:1.4.4)
- **Application Container**: The Jam-Build app built and run in test mode with coverage instrumentation

#### Global Setup (`src/test/globals.js`)
1. Creates a Docker network for inter-container communication
2. Starts MariaDB with test database and users
3. Initializes the Authorizer service with test configuration
4. Builds and starts the application container with coverage enabled
5. Sets environment variables for test execution

### Environment Variables

**Required for Containerized Testing:**
```bash
AUTHZ_ADMIN_SECRET=deadbEf-2af536fa
DB_DATABASE=jam_build
DB_USER=jbuser
DB_APP_USER=jbadmin
DB_PASSWORD=deadbEef-5dccb117
DB_ROOT_PASSWORD=deadbEef-0b62360e
DB_APP_PASSWORD=deadbEef-47148f2f
```

**For Local Testing:**
```bash
LOCALHOST_PORT=5000
AUTHZ_CLIENT_ID=<CLIENT_ID you started the local docker service with>
AUTHZ_URL=http://localhost:9010
```

## Test Fixtures and Multi-User Support

### Authenticated Context Fixtures (`src/test/fixtures.js`)

The test suite provides pre-authenticated browser contexts for different user roles:

- **`adminRequest`**: API request context with admin privileges
- **`userRequest`**: API request context with user privileges  
- **`adminPage`**: Browser page context with admin session
- **`userPage`**: Browser page context with user session

#### Session Management
- Authentication states are cached per worker in `.auth/state-{role}-{id}.json`
- Automatic user account creation and role assignment
- Session persistence across test runs for performance

## Coverage Collection Strategy

Jam-Build implements a sophisticated three-pronged coverage collection approach:

### 1. Data Service Coverage (Docker Container)
- Application runs with `c8` coverage in the Docker container
- Coverage reports extracted via Docker tar stream on test completion
- Stored in timestamped directories: `coverage/{timestamp}/`

### 2. Main Thread Coverage (Puppeteer/V8)
- Uses Playwright's underlying Puppeteer coverage interface
- Collects V8 coverage data from browser main thread
- Converted to Istanbul format using `v8-to-istanbul`

### 3. Service Worker Coverage (Manual Instrumentation)
- Service worker built with Istanbul instrumentation (`rollup-plugin-istanbul`)
- Coverage extracted via message passing to service worker
- Merged with main thread coverage for complete client-side coverage

### Coverage Utilities (`src/test/coverage.js`)
```javascript
// Start coverage collection
await startJS(page);

// ... run tests ...

// Stop and merge coverage
await stopJS(page, coverageMap);

// Generate reports
await createReport(coverageMap, testInfo);
```

## Running Tests

### Basic Test Commands

```bash
# Run full data mutation test suite (recommended)
npm run test

# Run with debug output
npm run test:debug

# Force rebuild of test containers
npm run test:build
```

### Local Development Testing

```bash
# Build with service worker instrumentation
npm run build:dev:sw

# Run API tests only
npm run test:local:api

# Run against all local services
npm run test:local

# Debug all local tests
npm run test:local:debug
```

### Playwright Project Configuration

The test suite is organized into multiple Playwright projects:

- **`fixtures`**: Sets up authenticated user contexts
- **`api`**: REST API endpoint tests (6 workers)
- **`pages`**: Page structure and navigation tests  
- **`data`**: End-to-end data mutation tests (1 worker, depends on fixtures/api/pages)
- **Browser projects**: Chrome, Firefox, WebKit, Mobile (Pixel 3)

## Test Patterns and Examples

### API Testing Pattern

```javascript
import { test } from '#test/fixtures.js';
import { getData, postData, deleteData } from './api.js';

test.describe('/api/data/app', () => {
  test('should get application data', async ({ adminRequest }) => {
    await getData(adminRequest, `${baseUrl}/api/data/app`, json => {
      expect(json).toStrictEqual(expect.objectContaining({
        home: expect.objectContaining({
          __version: expect.any(String)
        })
      }));
    });
  });
});
```

### Data Mutation Testing Pattern

```javascript
test('mutations with navigation terminus', async ({ page }) => {
  const userStateControl = page.locator('#user-home-state');
  
  // Perform mutations through UI
  const mutations = await doMutations(userStateControl);
  
  // Navigate to force batch processing
  await page.goto('/about');
  await page.goto('/');
  
  // Verify mutations persisted
  await testMutations(page, userStateControl, mutations);
});
```

### Offline Testing Pattern

```javascript
test('mutations offline', async ({ browser, browserName }) => {
  testInfo.skip(browserName !== 'chromium', 'Offline only in Chromium');
  
  const context = await browser.newContext();
  const page = await context.newPage();
  
  // Go offline
  context.route('**', route => route.abort());
  
  // Perform offline mutations
  const mutations = await doMutations(userStateControl);
  
  // Go online and verify sync
  context.unroute('**');
  await forceServiceWorkerReplay(page);
  
  await verifyMutations(page, mutations);
});
```

> Uses Playwright experimental flag `PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS=1` to enable service worker request interception for offline simulation.

## Advanced Testing Features

### Multi-User Concurrency Testing
Tests simulate multiple users making concurrent data changes to validate optimistic concurrency control and three-way merge resolution.

### Version Conflict Resolution
The test suite validates that version conflicts are properly detected and resolved through the application's merge strategies.

### Offline Capability Testing
Tests verify that:
- Data mutations work offline
- Changes are queued in IndexedDB
- Automatic synchronization occurs when connectivity returns
- Stale data indicators appear appropriately

### Service Worker Network Interception
Uses `PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS=1` to enable service worker request interception for offline simulation.

## Troubleshooting

### Common Issues

1. **Container Build Failures**
   - Use `FORCE_BUILD=1` to rebuild containers, use command `npm run test:build`
   - Check Docker daemon status
   - Verify sufficient disk space

2. **Coverage Report Issues**
   - Ensure service worker is built with instrumentation (`SW_INSTRUMENT=1`)
   - Check that coverage directories have write permissions
   - Verify v8-to-istanbul compatibility

3. **Authentication Failures**
   - Clear cached auth states in test output directories
   - Verify Authorizer service is properly initialized
   - Check environment variable configuration

4. **Timing Issues**
   - Increase timeouts for complex tests
   - Use `DEBUG=test*` for detailed logging
   - Consider network latency in CI environments

### Debug Mode

Enable comprehensive debug logging:
```bash
DEBUG=testcontainers*,server*,api*,test* npm run test:debug
```

### Performance Considerations

- **Container Reuse**: Test containers are cached between runs for performance
- **Parallel Execution**: API tests run with 6 workers, data tests serialize for consistency
- **Authentication Caching**: User sessions are cached per worker to reduce setup time

## Coverage Reports

Coverage reports are generated in multiple formats:
- **LCOV**: Standard coverage format for CI integration
- **HTML**: Human-readable coverage reports
- **JSON**: Programmatic coverage analysis

Reports are timestamped and organized by test suite for historical comparison and debugging.

### Report locations

Coverage reports are located in two main places:

- **`/coverage`**: Backend data service under test, extracted from Testcontainer at process shutdown
- **`/test-results/coverage`** - Frontend coverage reports (multiple, one report per suite)

### Backend Reports

The Backend data service coverage report is in two sub-locations, depending how you run:

- **Native**: Located in `/coverage/lcov-report`
- **Container**: Located in `coverage/<timestamp>/lcov-report`

### Frontend Reports

The Frontend app coverage reports are located under `/test-results/coverage`, titled by test-suite. Under each sub-directory you will find an `lcov-report` sub-directory with the report for the test suite. The mutation tests **`coverage-mutation-tests-0`** yield the most comprehensive coverage, as most of the application is under test in that suite.

---

This testing architecture provides comprehensive validation of Jam-Build's offline-first, multi-user capabilities while maintaining fast, reliable test execution through strategic use of Docker containers and intelligent coverage collection.