---
Author: Alex Grant <alex@localnerve.com> (https://www.localnerve.com)
Date: October 18, 2025
Title: Multi-Browser Testing Guide
---

# Multi-Browser Testing Guide

## Overview

jam-build uses [Playwright](https://playwright.dev) for end-to-end testing across multiple browser engines. Tests are designed to verify functionality in Chromium, Firefox, and WebKit to ensure broad compatibility.

## Quick Links
  - 🌏 [Browser Support](#browser-support)
  - 🏃‍♂️ [Running Tests Locally](#running-tests-locally)
  - 🧪 [CI Testing](#ci-testing-github-actions)
  - ⚠️ [WebKit Testing Limitations](#webkit-testing-limitations)
  - 🌐 [Test Environment Variables](#test-environment-variables)
  - 🛠️ [Troubleshooting](#troubleshooting)
  - 🚀 [Adding New Browser Tests](#adding-new-browser-tests)
  - 📚 [Quick Reference](#quick-reference)
  - 🔗 [Further Reading](#further-reading)

## Browser Support

### Chromium
- **Primary test target** on both local development and CI
- Represents Chrome, Edge, and other Chromium-based browsers
- Fastest and most stable testing experience

### Firefox
- **Full CI support** on GitHub Actions
- Represents Mozilla Firefox
- May have longer timeouts for TestContainer interactions

### WebKit
- **Local testing only** (macOS recommended)
- Represents Safari browser engine
- **Not tested in CI** due to GitHub Actions networking limitations with TestContainers
- See [WebKit Testing Limitations](#webkit-testing-limitations) for details

## Running Tests Locally

### Quick Start

The simplest way to run tests locally is with the default Chromium configuration:

```bash
npm test
```

This is equivalent to:
```bash
npm run test:chromium
```

### Testing Specific Browsers

Run tests against a specific browser engine:

```bash
# Chromium (Chrome, Edge, etc.)
npm run test:chromium

# Firefox
npm run test:firefox

# WebKit (Safari) - macOS only
npm run test:webkit
```

### Local Development Testing

When testing against a locally running application (not TestContainers):

```bash
# Start your dev server first
npm run dev

# In another terminal, run browser-specific tests
npm run test:local              # Chromium
npm run test:local:ff           # Firefox
npm run test:local:webkit       # WebKit (macOS)
```

### Debug Mode

Run tests in headed mode with debug logging:

```bash
npm run test:debug              # Chromium with debugger
npm run test:local:ff:debug     # Firefox headed mode
npm run test:local:webkit:debug # WebKit headed mode
```

### Test Categories

Run specific test suites:

```bash
# API tests only
npm run test:local:api
npm run test:local:api:ff
npm run test:local:api:webkit

# Data/mutation tests
npm run test:local:data

# Page navigation tests
npm run test:local:pages

# Performance tests
npm run test:local:performance
```

## CI Testing (GitHub Actions)

### Automated Browser Testing

The GitHub Actions workflow (`.github/workflows/verify.yml`) automatically tests **Chromium and Firefox** on every push and pull request to `main` and `stage` branches.

### CI Workflow Structure

1. **Build & Verify Job**
   - Installs dependencies with npm cache
   - Caches Playwright browser binaries
   - Runs linter and production build
   - Builds test Docker image (TestContainers)
   - Uploads Docker image as artifact

2. **Browser Tests Job** (Matrix)
   - Runs in parallel for Chromium and Firefox
   - Downloads shared Docker image artifact
   - Executes full test suite with TestContainers
   - Archives test reports (optional)

3. **Cleanup Job**
   - Deletes shared Docker image artifact
   - Always runs regardless of test results

### CI Test Commands

The CI workflow uses these npm scripts:

```bash
npm run test:build    # Build test Docker image
npm run test:chromium # Run Chromium tests
npm run test:firefox  # Run Firefox tests
```

### Performance Considerations

- **Browser binaries are cached** between workflow runs based on `package-lock.json` hash
- **Docker image is shared** between browser test jobs via artifacts (not re-built)
- **npm dependencies are cached** using `setup-node` action
- Tests run with appropriate timeouts for CI environment (longer than local)

## WebKit Testing Limitations

### Why WebKit Is Not Tested in CI

WebKit tests are excluded from GitHub Actions for the following technical reasons:

1. **TestContainers Networking**: GitHub Actions runners with TestContainers have networking issues specific to WebKit that prevent OAuth redirect flows from completing
2. **macOS Runner Constraints**: 
   - M1/M2 macOS runners cannot run Docker (no nested virtualization)
   - Intel macOS runners have Docker networking issues with TestContainers
3. **Platform Differences**: Playwright's WebKit on Linux behaves differently than actual Safari on macOS

### Testing WebKit Locally

#### Full Test Suite with TestContainers

The easiest way to test WebKit locally is with the full test suite using TestContainers:

```bash
npm run test:webkit
```

This runs the complete WebKit test suite with all services automatically managed by TestContainers.

#### Native Testing Without Docker (Advanced)

If you need to run tests against native services (without Docker TestContainers), you must manually run MariaDB and the Authorizer service locally on your hardware.

**Important**: The Authorizer must be configured specifically for WebKit's network security model. WebKit does not consider localhost secure by default, so you must disable the secure cookie flag.

##### Prerequisites

1. **MariaDB** running locally on port 3306
2. **Authorizer service** configured for non-secure cookies

##### Authorizer Configuration for WebKit

Create a `docker-compose.yml` file with the following configuration:

```yaml
name: authorizer-test
services:
  authorizer:
    image: localnerve/authorizer:v1.5.2
    environment:
      ENV: production
      ADMIN_SECRET: MySecretAdmin123!
      APP_COOKIE_SECURE: false  # CRITICAL: false for Safari/WebKit localhost testing
                                # Note: This disables secure cookies for all browsers
      DATABASE_TYPE: mariadb
      DATABASE_URL: admin:MyDBPassword456!@tcp(host.docker.internal:3306)/authorizer
      DATABASE_NAME: authorizer
      DISABLE_PLAYGROUND: false
      CLIENT_ID: 'E37D308D-9068-4FCC-BFFB-2AA535014C21'
      PORT: 9010
      ROLES: 'admin,user'
      LOG_LEVEL: 'debug'
      ORGANIZATION_NAME: 'Business Name'
      ORGANIZATION_LOGO: 'http://localhost:5000/images/logo-e16f7a5e32.svg'
    ports:
      - "9010:9010/tcp"
```

Start the service:

```bash
docker compose up -d
```

##### Running Native WebKit Tests

Once your local services are running:

```bash
# Standard local testing against native services
npm run test:local:webkit

# With debug output
npm run test:local:webkit:debug

# Specific test suites
npm run test:local:api:webkit
npm run test:local:pages:webkit
```

**Warning**: When `APP_COOKIE_SECURE` is set to `false`, the Authorizer will not work correctly with Chromium or Firefox (they require secure cookies for proper operation). This configuration is **WebKit/Safari specific** for localhost testing only.

### WebKit Testing Best Practices

1. **Test before merge**: Run WebKit tests locally on macOS before creating a pull request
2. **Focus on Safari-specific issues**: Pay attention to cookie handling, authentication flows, and service worker behavior
3. **Report issues**: If WebKit tests fail locally but pass in Chromium/Firefox, document the browser-specific behavior

## Test Environment Variables

Tests use these environment variables (automatically set by test scripts):

```bash
# Authentication service (TestContainers)
AUTHZ_URL=http://localhost:<dynamic-port> # 9010, 9011 for testcontainers
AUTHZ_CLIENT_ID=<generated-uuid>          # match the CLIENT_ID for the authorizer service
AUTHZ_ADMIN_SECRET=deadbEf-2af536fa       # match the ADMIN_SECRET for the authorizer service

# Database (TestContainers)
DB_DATABASE=jam_build
DB_USER=jbuser
DB_APP_USER=jbadmin
DB_PASSWORD=deadbEef-5dccb117
DB_ROOT_PASSWORD=deadbEef-0b62360e
DB_APP_PASSWORD=deadbEef-47148f2f

# Playwright features
PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS=1
```

For local proxy testing (HTTPS with DuckDNS):
```bash
# Supply YOUR duckdns domain for secure local tls host w/lets-encrypt
AUTHZ_URL=https://<your-duckdns-domain>.duckdns.org 
LOCALAPP_URL=https://<your-duckdns-subdomain>.duckdns.org
```
> See [Running Locally](localsetup.md#ngnix-for-local-ssl-proxy-hosts) for more detail and links to setup local tls development

## Troubleshooting

### Tests Timeout in CI

If tests timeout in GitHub Actions:
- Check the workflow logs for TestContainer startup times
- Verify Docker image artifact was uploaded/downloaded correctly
- Review test timeout values in `verify.yml` (currently 20s for Firefox/WebKit)

### WebKit Tests Fail Locally

Common issues:
- **macOS required**: WebKit tests are designed for macOS Safari behavior
- **OAuth redirects**: Ensure TestContainers are accessible from browser context
- **Cookie handling**: WebKit has stricter cookie security requirements

### **DEBUG**ging Tests

All code makes use of the `@localnerve/debug` package which uses the **DEBUG** environment variable to output more verbose info and critical state information. Almost every file in the project uses this (except service workers use enhanced, detailed console output based on NODE_ENV, automatically enabled by `npm run build:dev`).

The main relevant namespaces for terminal console output are:
  - `testcontainers:` - testcontainer output
  - `test:` - test script output
  - `api:` - app server api output
  - `server:` - app server output

Other namespaces exist for the browser client application and can be enabled by the **DEBUG** variable in `localStorage`, viewed in the browser console.

### Browser Cache Issues

If you encounter stale browser state:

```bash
# Clear Playwright browser cache
npx playwright install --force

# Or manually clear
rm -rf ~/.cache/ms-playwright
```

### Docker Image Issues

If TestContainer tests fail:

```bash
# Rebuild test Docker image
npm run test:build

# Check Docker is running
docker ps
```

## Adding New Browser Tests

To add tests for a new browser or configuration:

1. **Add npm script** in `package.json`:
   ```json
   "test:new-browser": "npm run test:env -- playwright test --project=NewBrowser"
   ```

2. **Update CI workflow** (if applicable) in `.github/workflows/verify.yml`:
   ```yaml
   matrix:
     label: ['firefox', 'chromium', 'new-browser']
   ```

3. **Configure Playwright project** in `playwright.config.js`:
   ```javascript
   {
     name: 'NewBrowser',
     use: { ...devices['Desktop NewBrowser'] }
   }
   ```

4. **Document limitations** if the browser has specific CI or platform constraints

## Quick Reference

| Browser   | Local Command                | CI Support | Platform      |
|-----------|------------------------------|------------|---------------|
| Chromium  | `npm run test:chromium`      | ✅ Yes     | All           |
| Firefox   | `npm run test:firefox`       | ✅ Yes     | All           |
| WebKit    | `npm run test:webkit`        | ❌ No      | macOS only    |

| Command                      | Description                                    |
|------------------------------|------------------------------------------------|
| `npm test`                   | Run Chromium tests (default)                   |
| `npm run test:build`         | Build TestContainers Docker image              |
| `npm run test:debug`         | Run Chromium tests in headed mode with debugger|
| `npm run test:local`         | Test against local dev server (Chromium)       |
| `npm run test:local:ff`      | Test against local dev server (Firefox)        |
| `npm run test:local:webkit`  | Test against local dev server (WebKit/macOS)   |

## Further Reading

- [Playwright Documentation](https://playwright.dev)
- [TestContainers Documentation](https://testcontainers.com)
- [GitHub Actions Workflow Syntax](https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions)
- [Jam-Build testing documentation](testing-documentation.md)