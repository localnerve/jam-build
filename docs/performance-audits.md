## Performance Auditing with Lighthouse

### Overview

The test suite includes Lighthouse performance auditing to validate web performance, accessibility, SEO, and best practices. Since JAM-Build is an offline-first application with sophisticated service worker behavior, performance testing validates both initial load performance and cached navigation performance.

### Lighthouse Integration Strategy

Due to Playwright's architecture limitations, Lighthouse integration uses a hybrid approach:
- **Chromium Launch with Debug Port**: Uses Playwright's chromium launcher with known debugging ports
- **Puppeteer for Authenticated Sessions**: Uses Puppeteer with cookie transfer for authenticated performance testing
- **Containerized Testing**: Runs against the same Dockerized services as functional tests

### Directory Structure

```
src/test/
├── pages/                  # Page tests
│   └── lighthouse.test.js  # Lighthouse performance audit tests
```

### Performance Test Implementation

#### Lighthouse Performance Tests (`src/test/pages/lighthouse.test.js`)

The performance test suite includes comprehensive auditing utilities and threshold validation:

```javascript
/**
 * Save a report for a test to the audit directory.
 * 
 * @param {TestInfo} testInfo - The playwright.dev TestInfo object
 * @param {Object} report - The lighthouse Report object
 */
async function writeAuditReport (testInfo, report) {
  const auditDir = 'audits';
  const title = testInfo.title.replace(/\s+/g, '-');
  const outputDir = path.join(testInfo.project.outputDir, auditDir);
  const outputPath = path.join(outputDir, `${title}.html`);

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(outputPath, report);
}
```

### Performance Test Patterns

#### Public Page Performance Audit

Tests anonymous user performance using Playwright's chromium launcher with a fixed debugging port:

```javascript
test('public home page audit', async ({ browserName }, testInfo) => {
  test.skip(browserName !== 'chromium', 'Lighthouse is only supported by the chromium browser');

  const debugPort = 9222;
  const browser = await chromium.launch({
    args: [`--remote-debugging-port=${debugPort}`],
    headless: true
  });

  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(baseUrl);

  await auditAndReport(baseUrl, debugPort, testInfo);

  await browser.close();
});
```

#### Authenticated Performance Testing

Tests authenticated user performance by transferring sessions from Playwright fixtures to Puppeteer:

```javascript
test('authenticated home page audit', async ({ adminPage, browserName }, testInfo) => {
  test.skip(browserName !== 'chromium', 'Lighthouse is only supported by the chromium browser');

  await adminPage.goto(baseUrl);
  const cookies = await adminPage.context().cookies();

  const browser = await puppeteer.launch({ headless: true });
  await browser.setCookie(...cookies.map(cookie => ({
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain,
    path: cookie.path,
    secure: cookie.secure,
    httpOnly: cookie.httpOnly
  })));
  
  const page = await browser.newPage();
  await page.goto(baseUrl);

  const browserWSEndpoint = browser.wsEndpoint();
  const port = new URL(browserWSEndpoint).port;
  
  await auditAndReport(baseUrl, parseInt(port), testInfo);

  await browser.close();
});
```

### Performance Threshold Configuration

#### Audit Configuration and Assertions

```javascript
async function auditAndReport (url, port, testInfo) {
  const result = await lighthouse(url, {
    port,
    output: 'html',
    onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
    skipAudits: ['uses-http2'] // Skip HTTP/2 for containerized testing
  });
  
  // Assert performance thresholds
  const {
    performance,
    accessibility, 
    'best-practices': bestPractices,
    seo
  } = result.lhr.categories;

  expect(performance.score * 100).toBeGreaterThan(99);
  expect(accessibility.score * 100).toBeGreaterThan(99);
  expect(bestPractices.score * 100).toBeGreaterThan(99);
  expect(seo.score * 100).toBeGreaterThan(99);
  
  await writeAuditReport(testInfo, result.report);
}
```

### Performance Test Commands

```bash
# Run performance audits
npm run test:performance

# Run performance with local services
npm run test:local:performance
```

### Package.json Script Integration

```json
{
  "scripts": {
    "test:performance": "npm run test:env -- playwright test --project=performance",
    "test:local:performance": "npm run test:env:local -- playwright test --project=performance"
  }
}
```

### Playwright Configuration Addition

```javascript
// Add to playwright.config.js projects array
{
  name: 'performance',
  testMatch: 'pages/lighthouse.test.js',
  dependencies: ['fixtures'], // Ensure authenticated contexts available
}
```

### Performance Report Management

#### Report Storage Strategy

Performance reports are automatically saved to organized directories:

- **Location**: `test-results/audits/`
- **Naming**: Test titles converted to kebab-case (e.g., `public-home-page-audit.html`)
- **Format**: Full HTML reports with detailed metrics and recommendations
- **Organization**: Separate reports for each test case

#### Browser Compatibility

- **Chromium Only**: Lighthouse audits are skipped on Firefox and WebKit
- **Automatic Detection**: Tests skip gracefully when run on unsupported browsers
- **CI Integration**: Ensures consistent testing environment across platforms

### Performance Testing Considerations

#### High Performance Thresholds

JAM-Build maintains exceptionally high performance standards:
- **Performance**: >99% (near-perfect optimization)
- **Accessibility**: >99% (comprehensive accessibility implementation)
- **Best Practices**: >99% (modern web standards compliance)
- **SEO**: >99% (optimal search engine compatibility)

#### Docker Environment Adaptations

- **HTTP/2 Audits Skipped**: Containerized testing may not support HTTP/2
- **Network Isolation**: Tests run within Docker network constraints
- **Consistent Baselines**: Containerized environment provides reproducible performance metrics

#### Service Worker Performance

The performance tests validate JAM-Build's service worker-first architecture:
- **Initial Load**: Tests cold-start performance without service worker
- **Authenticated Performance**: Validates performance impact of authentication state
- **Cache Strategy Validation**: Implicit testing of stale-while-revalidate performance

This performance testing integration provides comprehensive validation of JAM-Build's exceptional web performance characteristics while maintaining consistency with the existing testing architecture.