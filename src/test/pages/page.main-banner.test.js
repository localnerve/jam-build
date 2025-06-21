/**
 * Tests for main-banner pages
 * 
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */
/* eslint-disable playwright/expect-expect */

import { test, expect } from '../fixtures.js';
import { startJS, stopJS, createMap, createReport } from '../coverage.js';

test.describe('main-banner tests', () => {
  let baseUrl;
  let map;

  test.beforeAll(() => {
    baseUrl = process.env.BASE_URL;
    map = createMap();
  });

  test.beforeEach(async ({ page }) => {
    await startJS(page);
  });

  test.afterEach(async ({ page }) => {
    await stopJS(page, map);
  });

  test.afterAll(async ({}, testInfo) => {
    await createReport(map, testInfo);
  });

  async function checkMarkup (page, url, name, hasAll = true, customTest = async () => true) {
    await page.goto(url);

    // has a page classed main
    const main = page.getByRole('main');
    await expect(main).toContainClass(name);

    // has a header with a header class
    const header = page.getByRole('banner');
    await expect(header.first()).toHaveClass(/(^|\s*)(ln-)?header($|\s*)/);

    // has at least one name classed section
    const specificSection = page.locator(`section[class*="${name}"]`);
    await expect(specificSection.first()).toBeVisible();

    // has all section
    if (hasAll) {
      const allSection = page.locator('section[class*="all"]');
      await expect(allSection.first()).toBeVisible();
    }

    // has a contentinfo footer
    const footer = page.getByRole('contentinfo');
    await expect(footer.last()).toHaveClass(/(^|\s*)(ln-)?footer($|\s*)/);

    await customTest(page);
  }

  test('public home page', async ({ page }) => {
    await checkMarkup(page, baseUrl, 'home');
  });

  test('public about page', async ({ page }) => {
    await checkMarkup(page, `${baseUrl}/about`, 'about');
  });

  test('public contact page', async ({ page }) => {
    await checkMarkup(page, `${baseUrl}/contact`, 'contact');
  });

  test('public privacy page', async ({ page }) => {
    await checkMarkup(page, `${baseUrl}/privacy`, 'privacy', false);
  });

  test('public terms page', async ({ page }) => {
    await checkMarkup(page, `${baseUrl}/terms`, 'terms', false);
  });

  test('public 404 page', async ({ page }) => {
    await checkMarkup(page, `${baseUrl}/none`, 'four04', false, async page => {
      const four04 = page.getByTestId('404');
      await expect(four04).toHaveCount(1);
    });
  });
});