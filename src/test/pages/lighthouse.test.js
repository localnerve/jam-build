/**
 * Tests for lighthouse thresholds.
 * 
 * Jam-build, a web application practical reference.
 * Copyright (c) 2025 Alex Grant <info@localnerve.com> (https://www.localnerve.com), LocalNerve LLC
 * 
 * This file is part of Jam-build.
 * Jam-build is free software: you can redistribute it and/or modify it
 * under the terms of the GNU Affero General Public License as published by the Free Software
 * Foundation, either version 3 of the License, or (at your option) any later version.
 * Jam-build is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY;
 * without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 * See the GNU Affero General Public License for more details.
 * You should have received a copy of the GNU Affero General Public License along with Jam-build.
 * If not, see <https://www.gnu.org/licenses/>.
 * Additional terms under GNU AGPL version 3 section 7:
 * a) The reasonable legal notice of original copyright and author attribution must be preserved
 *    by including the string: "Copyright (c) 2025 Alex Grant <info@localnerve.com> (https://www.localnerve.com), LocalNerve LLC"
 *    in this material, copies, or source code of derived works.
 */
/* eslint-disable playwright/expect-expect */
import fs from 'node:fs/promises';
import path from 'node:path';
import lighthouse from 'lighthouse';
import puppeteer from 'puppeteer';
import { test, expect, chromium } from '#test/fixtures.js';

test.describe('performance audits', () => {
  let baseUrl;

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

  /**
   * Run lighthouse threshold audit assertions and write the report.
   * 
   * @param {String} url - The url to audit
   * @param {Number} port - The port to connect lighthouse on
   * @param {TestInfo} testInfo - The playwright.dev TestInfo object
   */
  async function auditAndReport (url, port, testInfo) {
    const result = await lighthouse(url, {
      port,
      output: 'html',
      onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
      // Use existing browser context
      skipAudits: ['uses-http2']
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

  test.beforeAll(() => {
    baseUrl = process.env.BASE_URL;
  });

  test('public home page audit', async ({ browserName }, testInfo) => {
    test.setTimeout(testInfo.timeout + 10000);

    // We can only test this with chromium
    testInfo.skip(browserName !== 'chromium', 'Lighthouse is only supported by the chromium browser');
  
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

  test('authenticated home page audit', async ({ adminPage, browserName }, testInfo) => {
    test.setTimeout(testInfo.timeout + 10000);

    // We can only test this with chromium
    testInfo.skip(browserName !== 'chromium', 'Lighthouse is only supported by the chromium browser');

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
    
    // Navigate to trigger authentication
    const page = await browser.newPage();
    await page.goto(baseUrl);

    const browserWSEndpoint = browser.wsEndpoint();
    const port = new URL(browserWSEndpoint).port;
    
    await auditAndReport(baseUrl, parseInt(port), testInfo);

    await browser.close();
  });
});