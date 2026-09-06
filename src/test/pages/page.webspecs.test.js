/**
 * Regression tests for The Website Specification baseline
 * (https://specification.website), organized by the spec's categories.
 *
 * These tests guard both the gaps closed by recent changesets and the
 * items the project already satisfied, so regressions do not creep in:
 *   Foundations       - charset, viewport, lang, title, description, canonical
 *   Performance       - no-cache HTML, immutable fingerprinted assets
 *   Security          - HSTS (TLS only), clickjacking, CSP, nosniff,
 *                       Referrer-Policy, Permissions-Policy, no X-XSS-Protection
 *   SEO               - robots.txt (+ AI-crawler policy), sitemap.xml, llms.txt
 *   Accessibility     - landmarks, color-scheme, theme-color, web manifest
 *   Well-known URIs   - security.txt content and cross-references
 *   Agent Readiness   - Link header discovery for agents that don't parse HTML
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

import { test, expect } from '#test/fixtures.js';

test.describe('website specification baseline', () => {
  let baseUrl;
  // HSTS is only served when the app runs behind a TLS proxy (devcontainer Caddy,
  // production reverse proxy). Plain-HTTP test targets must not send it.
  let expectedHsts;

  test.beforeAll(() => {
    baseUrl = process.env.BASE_URL;
    const tls = baseUrl.startsWith('https:');
    expectedHsts = tls ? 'max-age=63072000; includeSubDomains' : undefined;
  });

  test.describe('foundations', () => {
    test('html head declares charset, viewport, lang, title, description, canonical', async ({ page }) => {
      await page.goto(`${baseUrl}/about`);

      // UTF-8 charset declared
      const charset = page.locator('meta[charset]');
      await expect(charset).toHaveAttribute('charset', /utf-?8/i);

      // responsive viewport
      const viewport = page.locator('meta[name="viewport"]');
      await expect(viewport).toHaveAttribute('content', /width=device-width/);

      // document language
      const html = page.locator('html');
      await expect(html).toHaveAttribute('lang', /^en/);

      // title and description
      await expect(page).not.toHaveTitle(/^\s*$/);
      const description = page.locator('meta[name="description"]');
      await expect(description).toHaveAttribute('content', /.+/);

      // canonical link for the current page
      const canonical = page.locator('link[rel="canonical"]');
      await expect(canonical).toHaveCount(1);
    });

    test('color-scheme and theme-color are declared', async ({ page }) => {
      await page.goto(`${baseUrl}/about`);

      // light/dark support advertised to the browser
      const colorScheme = page.locator('meta[name="color-scheme"]');
      await expect(colorScheme).toHaveAttribute('content', /light/);
      await expect(colorScheme).toHaveAttribute('content', /dark/);

      // theme-color for mobile browsers
      const themeColor = page.locator('meta[name="theme-color"]');
      await expect(themeColor).toHaveAttribute('content', /^#[0-9a-f]{3,8}$/i);
    });
  });

  test.describe('performance', () => {
    test('html routes are no-cache for revalidation', async ({ page }) => {
      const response = await page.goto(`${baseUrl}/about`);
      expect(response.status()).toBe(200);
      const cacheControl = response.headers()['cache-control'] ?? '';
      expect(cacheControl).toMatch(/no-cache|must-revalidate/);
    });

    test('fingerprinted assets are cached far-future and immutable', async ({ page }) => {
      await page.goto(`${baseUrl}/about`);

      // collect a fingerprinted asset URL from the rendered page.
      // prod builds fingerprint assets; dev builds may not, in which case
      // there is nothing to assert here.
      const hrefs = [
        ...await page.locator('link[rel="stylesheet"]').evaluateAll(els => els.map(el => el.href)),
        ...await page.locator('script[src]').evaluateAll(els => els.map(el => el.src))
      ];
      const fingerprinted = hrefs.find(u => /[a-z0-9]{10}\.[\w+]+/.test(u));
      // eslint-disable-next-line playwright/no-skipped-test -- dev builds don't fingerprint; nothing to assert
      test.skip(!fingerprinted, 'no fingerprinted assets in this build');

      const response = await page.request.get(fingerprinted);
      expect(response.status()).toBe(200);
      expect(response.headers()['cache-control']).toBe(
        'public, max-age=31536000, immutable'
      );
    });
  });

  test.describe('security', () => {
    test('response headers enforce the security baseline', async ({ page }) => {
      const response = await page.goto(`${baseUrl}/about`);
      const headers = response.headers();

      // HSTS - required by spec, no preload. Only served over TLS;
      // plain-HTTP responses must never carry it.
      expect(headers['strict-transport-security']).toBe(expectedHsts);

      // clickjacking protection (legacy + modern)
      expect(headers['x-frame-options']).toBe('SAMEORIGIN');
      expect(headers['content-security-policy'] ?? '').toContain('frame-ancestors');

      // MIME sniffing disabled on HTML responses
      expect(headers['x-content-type-options']).toBe('nosniff');

      // referrer leakage minimized
      expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');

      // unused powerful features disabled (client uses none of these)
      const permissions = headers['permissions-policy'] ?? '';
      expect(permissions).toContain('camera=()');
      expect(permissions).toContain('geolocation=()');

      // cross-origin isolation baseline on page routes only: COOP severs the
      // window.opener link (tabnabbing), CORP keeps resources out of other
      // origins' processes. Assets must not carry these headers.
      expect(headers['cross-origin-opener-policy']).toBe('same-origin');
      expect(headers['cross-origin-resource-policy']).toBe('same-site');

      // dead header - spec status: avoid
      expect(headers['x-xss-protection']).toBeUndefined();
    });

    test('assets do not carry page-only security headers', async ({ page, request }) => {
      await page.goto(`${baseUrl}/about`);

      // Read the stylesheet URL from the rendered DOM, not raw HTML: prod
      // builds minify with removeAttributeQuotes, so a quoted-href regex on
      // the source is unreliable. el.href resolves to an absolute URL that
      // works in every mode (dev unfingerprinted, devcontainer, prod).
      const cssHrefs = await page.locator('link[rel="stylesheet"]')
        .evaluateAll(els => els.map(el => el.href));
      expect(cssHrefs.length, 'no stylesheet found in page').toBeGreaterThan(0);

      const asset = await request.get(cssHrefs[0]);
      expect(asset.status()).toBe(200);
      expect(asset.headers()['cross-origin-opener-policy']).toBeUndefined();
      expect(asset.headers()['x-frame-options']).toBeUndefined();
    });

    test('page html carries a CSP policy', async ({ page }) => {
      await page.goto(`${baseUrl}/about`);

      // The full CSP is embedded as a meta tag (with hash-based hardening in
      // prod builds). Any non-empty meta-delivered policy must define default
      // sources; dev builds leave the meta tag but strip its content.
      // frame-ancestors via meta is ignored by browsers, so clickjacking
      // protection always rides on the response header (tested above).
      const contents = await page.locator('meta[http-equiv="Content-Security-Policy"]')
        .evaluateAll(els => els.map(el => el.getAttribute('content')));
      expect(contents.every(c => !c.trim() || c.includes('default-src'))).toBe(true);
    });

    test('no inline event handlers in page markup', async ({ page }) => {
      // with hash-based CSP, on* attributes can never execute; they should
      // not exist in the templates at all
      await page.goto(`${baseUrl}/about`);
      const inlineHandlers = page.locator('[onclick], [onload], [onerror], [onsubmit], [oninput]');
      await expect(inlineHandlers).toHaveCount(0);
    });
  });

  test.describe('seo', () => {
    test('robots.txt allows crawling, references the sitemap, and names AI crawlers', async ({ request }) => {
      const response = await request.get(`${baseUrl}/robots.txt`);
      expect(response.status()).toBe(200);
      const text = await response.text();

      // default crawl policy + sitemap reference.
      // The sitemap URL is canonical (siteData.appHost), not the test target host.
      expect(text).toContain('User-agent: *');
      expect(text).toMatch(/Sitemap: https:\/\/[^ ]*\/sitemap\.xml/);

      // explicit AI-crawler policy makes the site legible to agents
      for (const agent of ['GPTBot', 'Google-Extended', 'ClaudeBot', 'PerplexityBot', 'Bytespider']) {
        expect(text).toContain(`User-agent: ${agent}`);
      }
    });

    test('sitemap.xml lists the public pages with absolute URLs', async ({ request }) => {
      const response = await request.get(`${baseUrl}/sitemap.xml`);
      expect(response.status()).toBe(200);
      const text = await response.text();

      expect(text).toContain('<urlset');
      // canonical https URLs from site-data, including the main pages
      for (const route of ['/', '/about', '/contact']) {
        const escaped = route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        expect(text).toMatch(new RegExp(`<loc>https://[^<]*${escaped}</loc>`));
      }
      // error pages are not in the sitemap
      expect(text).not.toMatch(/<\/404><\/loc>/);
    });

    test('llms.txt is a curated markdown index of the public pages', async ({ request }) => {
      const response = await request.get(`${baseUrl}/llms.txt`);
      expect(response.status()).toBe(200);
      const text = await response.text();

      // header with the business name, then one entry per real page route.
      // URLs are canonical (siteData.appHost), not the test target host, so
      // match on title + path suffix rather than the full URL.
      expect(text).toMatch(/^# /m);
      for (const [title, route] of [['Home', '/'], ['About', '/about'], ['Contact', '/contact']]) {
        const escaped = route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        expect(text).toMatch(new RegExp(`\\[${title}\\]\\([^)]*${escaped}\\)`));
      }
      // error pages and non-routes are excluded
      expect(text).not.toMatch(/\]\([^)]*\/404\)/);
      expect(text).not.toContain('](#)');
    });
  });

  test.describe('accessibility', () => {
    test('page uses semantic landmarks', async ({ page }) => {
      await page.goto(`${baseUrl}/about`);

      const banner = page.getByRole('banner');
      await expect(banner.first()).toBeAttached();
      const main = page.getByRole('main');
      await expect(main).toBeAttached();
      const contentinfo = page.getByRole('contentinfo');
      await expect(contentinfo.last()).toBeAttached();
    });

    test('web manifest is valid and installable', async ({ page, request }) => {
      await page.goto(`${baseUrl}/about`);
      const link = page.locator('link[rel="manifest"]');
      await expect(link).toHaveCount(1);

      const webmanifest = await link.getAttribute('href');
      const response = await request.get(`${baseUrl}/${webmanifest}`);
      expect(response.status()).toBe(200);
      const manifest = await response.json();

      // required for installability
      expect(manifest.name).toBeTruthy();
      expect(manifest.short_name).toBeTruthy();
      expect(Array.isArray(manifest.icons)).toBe(true);
      // 192px and 512px icons are the installability baseline
      const sizes = manifest.icons.map(icon => icon.sizes).join(',');
      expect(sizes).toContain('192');
      expect(sizes).toContain('512');
      expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(manifest.background_color).toMatch(/^#[0-9a-f]{6}$/i);
    });

    test('manifest is linked from the page head', async ({ page }) => {
      await page.goto(`${baseUrl}/about`);
      const link = page.locator('link[rel="manifest"]');
      await expect(link).toHaveCount(1);
      await expect(link.first()).toHaveAttribute('href', /site(?:-[0-9a-f]{10})?\.webmanifest/);
    });
  });

  test.describe('well-known uris', () => {
    test('security.txt declares contact, expiry, canonical, and policy', async ({ request }) => {
      const response = await request.get(`${baseUrl}/.well-known/security.txt`);
      expect(response.status()).toBe(200);
      const text = await response.text();

      // RFC 9116 fields - contact is the only required one.
      // URLs are canonical (siteData.appHost), not the test target host.
      expect(text).toMatch(/^Contact: mailto:.+$/m);
      expect(text).toMatch(/^Expires: \d{4}-\d{2}-\d{2}/m);
      expect(text).toMatch(/^Canonical: https:\/\/[^ ]*\/\.well-known\/security\.txt$/m);
      // policy points at the real privacy page
      expect(text).toMatch(/^Policy: https:\/\/[^ ]*\/privacy$/m);
    });
  });

  test.describe('agent readiness', () => {
    test('link header advertises machine-readable resources on page routes', async ({ request }) => {
      const response = await request.get(`${baseUrl}/about`);
      const link = response.headers().link ?? '';

      // agents that never parse HTML can still discover the site's index
      expect(link).toContain('</sitemap.xml>; rel="sitemap"');
      expect(link).toContain('</llms.txt>; rel="llms-text"');
      expect(link).toContain('</.well-known/security.txt>; rel="security"');
    });

    test('link header is not sent for non-page routes', async ({ request }) => {
      const response = await request.get(`${baseUrl}/robots.txt`);
      expect(response.headers().link).toBeUndefined();
    });
  });
});
