/**
 * Generate per-page JSON-LD "islands" from site-data.json.
 *
 * Pattern: one shared Organization + WebSite graph (defined once, from
 * siteData.business / siteData.social), referenced by @id from every page's
 * own WebPage-derived node. Page-type-specific shaping is done through a
 * small builder registry keyed on `page.type`, so adding a new static site
 * type (blog, product, event...) later means registering a new builder here
 * -- not touching the render pipeline.
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
import { loadSiteData } from './data.js';

/**
 * Page types that never get a JSON-LD island.
 * - 'admin': internal-only surface, not meant to be indexed or referenced.
 * - 'none': error pages (404/403/500/503).
 * Pages with no `page.template` (e.g. the login modal trigger) never reach
 * this module at all -- templates.js only builds templates for pages that
 * define one.
 */
const SKIP_TYPES = new Set(['admin', 'none']);

/**
 * nav-type pages get their schema.org @type resolved by page.name, since
 * "nav" alone doesn't tell you if it's the homepage, an About page, etc.
 * Anything not listed here (a nav page you add later) safely falls back
 * to plain WebPage.
 */
const NAV_TYPE_BY_NAME = {
  home: 'WebPage',
  about: 'AboutPage',
  contact: 'ContactPage'
};

/**
 * Pages whose primary subject IS the Organization (so `about` points at it).
 * Extend this list (or switch to a data-driven flag in site-data.json, see
 * README note below) as you add more org-describing pages.
 */
const ABOUT_ORG_NAMES = new Set(['home', 'about', 'contact']);

/**
 * Pages where the Organization is also the concrete answer to "what is
 * this page for" (About/Contact) rather than just contextually related
 * (legal pages, which are about the org but not "mainEntity"-about it).
 */
const MAIN_ENTITY_ORG_NAMES = new Set(['about', 'contact']);

/**
 * Build the site-wide Organization node. Defined once, referenced everywhere.
 *
 * @param {Object} siteData - global site-data.json.
 * @returns {Object} An Organization node with a stable @id.
 */
function buildOrganization (siteData) {
  const { business, social, appHost } = siteData;
  const addr = business.address;

  const sameAs = [
    social?.facebook,
    social?.linkedin,
    social?.twitter
  ].filter(Boolean);

  return {
    '@type': 'Organization',
    '@id': `https://${appHost}/#organization`,
    name: business.name,
    url: business.url,
    logo: {
      '@type': 'ImageObject',
      url: business.logo
    },
    telephone: business.phone,
    email: business.email,
    address: {
      '@type': 'PostalAddress',
      streetAddress: [addr.line1, addr.line2, addr.line3].filter(Boolean).join(', '),
      addressLocality: addr.city,
      addressRegion: addr.state,
      postalCode: addr.zip,
      addressCountry: addr.country
    },
    ...(sameAs.length ? { sameAs } : {})
  };
}

/**
 * Build the site-wide WebSite node. Defined once, referenced everywhere.
 *
 * @param {Object} siteData - global site-data.json.
 * @returns {Object} A WebSite node with a stable @id.
 */
function buildWebsite (siteData) {
  const { appHost, defaultTitle } = siteData;
  return {
    '@type': 'WebSite',
    '@id': `https://${appHost}/#website`,
    url: `https://${appHost}/`,
    name: defaultTitle,
    publisher: { '@id': `https://${appHost}/#organization` }
  };
}

/**
 * Build a BreadcrumbList for a single (non-home) page.
 *
 * @param {Object} page - the page entry from siteData.pages.
 * @param {String} appHost - siteData.appHost.
 * @returns {Object} A BreadcrumbList node.
 */
function buildBreadcrumb (page, appHost) {
  return {
    '@type': 'BreadcrumbList',
    '@id': `https://${appHost}${page.route}#breadcrumb`,
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `https://${appHost}/` },
      { '@type': 'ListItem', position: 2, name: page.label || page.title }
    ]
  };
}

/**
 * Resolve the schema.org @type for a page, based on page.type / page.name.
 *
 * @param {Object} page - the page entry from siteData.pages.
 * @returns {String} A schema.org type name.
 */
function resolvePageType (page) {
  if (page.type === 'nav') {
    return NAV_TYPE_BY_NAME[page.name] || 'WebPage';
  }
  // 'legal' (and any future non-nav content type) has no dedicated
  // schema.org type -- plain WebPage is the spec-correct choice.
  // Add any future page.type tests here.
  return 'WebPage';
}

/**
 * Build the page-specific WebPage-derived node for a single page.
 *
 * @param {Object} page - the page entry from siteData.pages.
 * @param {Object} siteData - global site-data.json.
 * @returns {Object} The page node, plus (if applicable) its breadcrumb node.
 */
function buildPageNode (page, siteData) {
  const { appHost } = siteData;
  const pageUrl = `https://${appHost}${page.route}`;
  const orgId = `https://${appHost}/#organization`;
  const siteId = `https://${appHost}/#website`;

  const node = {
    '@type': resolvePageType(page),
    '@id': `${pageUrl}#webpage`,
    url: pageUrl,
    name: page.title,
    isPartOf: { '@id': siteId }
  };

  if (page.description) {
    node.description = page.description;
  } else {
    node.description = siteData.defaultDescription;
  }

  if (ABOUT_ORG_NAMES.has(page.name) || page.type === 'legal') {
    node.about = { '@id': orgId };
  }
  if (MAIN_ENTITY_ORG_NAMES.has(page.name)) {
    node.mainEntity = { '@id': orgId };
  }

  const extras = [];
  if (page.route !== '/') {
    const breadcrumb = buildBreadcrumb(page, appHost);
    node.breadcrumb = { '@id': breadcrumb['@id'] };
    extras.push(breadcrumb);
  }

  return { node, extras };
}

/**
 * Build the full @graph island for one page (shared nodes + page node),
 * serialized as a ready-to-inline <script> tag.
 *
 * @param {Object} page - the page entry from siteData.pages.
 * @param {Object} siteData - global site-data.json.
 * @param {Array} sharedNodes - [Organization, WebSite] nodes, shared by reference.
 * @returns {String|null} The <script type="application/ld+json"> markup, or null to skip.
 */
function buildPageIsland (page, siteData, sharedNodes) {
  if (SKIP_TYPES.has(page.type)) {
    return null;
  }

  const { node, extras } = buildPageNode(page, siteData);
  const graph = {
    '@context': 'https://schema.org',
    '@graph': [...sharedNodes, node, ...extras]
  };

  // Note: <script type="application/ld+json"> is inert data, not executable
  // script -- CSP's script-src does not govern it, so this doesn't need (and
  // won't break under) the CSP hashing done later in html.js.
  return `<script type="application/ld+json">${JSON.stringify(graph)}</script>`;
}

/**
 * Build the { pageName: islandMarkup } map for every renderable page.
 *
 * @param {String} dataDir - the directory containing site-data.json.
 * @returns {Object} Hash of page.name -> <script> markup (only for pages that get one).
 */
export async function loadJsonLd (dataDir) {
  const siteData = await loadSiteData(dataDir);
  const sharedNodes = [buildOrganization(siteData), buildWebsite(siteData)];

  const jsonld = {};
  for (const page of Object.values(siteData.pages)) {
    const island = buildPageIsland(page, siteData, sharedNodes);
    if (island) {
      jsonld[page.name] = island;
    }
  }
  return jsonld;
}