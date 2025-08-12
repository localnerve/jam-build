/**
 * Tests for main-banner pages
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

import { test, expect } from '#test/fixtures.js';
import { startJS, stopJS, createMap, createReport } from '#test/coverage.js';

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

  // eslint-disable-next-line no-empty-pattern
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

  async function checkServiceWorker (page) {
    const swURL = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      return registration.active?.scriptURL;
    });
    expect(swURL).toBe(`${baseUrl}/sw.main.js`);
  }

  test('public home page', async ({ page }) => {
    await checkMarkup(page, baseUrl, 'home', true, checkServiceWorker);
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