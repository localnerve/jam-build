// @ts-check
/**
 * Generate per-page JSON-LD "islands" from site-data.json.
 *
 * Pattern: one shared Organization + WebSite graph (defined once, from
 * siteData.business / siteData.social), referenced by \ from every page's
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
import { log } from './utils.js';

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
 * schema.org container types whose identifying data lives on child items
 * (e.g. BreadcrumbList's itemListElement), so the top-level name/url check
 * in validateGraph doesn't apply to them.
 */
const CONTAINER_TYPES = ['BreadcrumbList'];

/**
 * nav-type pages get their schema.org \ resolved by page.name, since
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
 * The shape of site-data.json consumed by this module (loose on purpose --
 * it is produced by data.js and validated there).
 *
 * @typedef {Object} PageEntry
 * @property {String} type - page.type ('nav' | 'legal' | 'admin' | 'none' ...).
 * @property {String} name - the page's key/name.
 * @property {String} route - the page's URL route, starting with '/'.
 * @property {String} [label] - short nav label, if any.
 * @property {String} title - the page title.
 * @property {String} [description] - per-page description override.
 *
 * @typedef {Object} SiteData
 * @property {Record<String, PageEntry>} pages - keyed by page name.
 * @property {String} appHost - bare hostname, e.g. 'example.com'.
 * @property {String} defaultTitle - site-wide title.
 * @property {String} defaultDescription - site-wide description.
 * @property {Record<String, any>} business - name/url/logo/phone/email/address.*.
 * @property {Record<String, any>} [social] - facebook/linkedin/twitter, any subset.
 */

/**
 * Build the site-wide Organization node. Defined once, referenced everywhere.
 *
 * @param {SiteData} siteData - global site-data.json.
 * @returns {import('schema-dts').Organization} An Organization node with a stable identifier derived from appHost.
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
 * @param {SiteData} siteData - global site-data.json.
 * @returns {import('schema-dts').WebSite} A WebSite node with a stable identifier derived from appHost.
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
 * @param {PageEntry} page - the page entry from siteData.pages.
 * @param {String} appHost - siteData.appHost.
 * @returns {import('schema-dts').BreadcrumbList} A BreadcrumbList node.
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

/** @type {Record<String, String>} */
const navTypeByName = NAV_TYPE_BY_NAME;

/**
 * Resolve the schema.org type for a page, based on page.type / page.name.
 *
 * @param {PageEntry} page - the page entry from siteData.pages.
 * @returns {'WebPage' | 'AboutPage' | 'ContactPage'} A schema.org type name.
 */
function resolvePageType (page) {
  if (page.type === 'nav') {
    // The Record's values are the union by construction, but tsc sees
    // plain string -- narrow explicitly at this single exit point.
    return /** @type {'WebPage'|'AboutPage'|'ContactPage'} */ (navTypeByName[page.name] || 'WebPage');
  }
  // INFO: Add any future page.type tests here.

  // 'legal' (and any future non-nav content type) has no dedicated
  // schema.org type -- plain WebPage is the spec-correct choice.
  return 'WebPage';
}

/**
 * Build the page-specific WebPage-derived node for a single page.
 *
 * @param {PageEntry} page - the page entry from siteData.pages.
 * @param {SiteData} siteData - global site-data.json.
 * @returns {{ node: PageNode, extras: Array<import('schema-dts').BreadcrumbList> }}
 *   The page node, plus (if applicable) its breadcrumb node.
 */
function buildPageNode (page, siteData) {
  const { appHost } = siteData;
  const pageUrl = `https://${appHost}${page.route}`;
  const orgId = `https://${appHost}/#organization`;
  const siteId = `https://${appHost}/#website`;

  /**
   * The concrete type is chosen at runtime (WebPage/AboutPage/ContactPage).
   * Intersecting the three schema-dts types directly would collapse to never
   * (each pins a different '@type' literal), so pin WebPage's shape and
   * widen only '@type'.
   *
   * @typedef {Omit<import('schema-dts').WebPage, '@type'> & { '@type': 'WebPage' | 'AboutPage' | 'ContactPage' }} PageNode
   */
  const node = {
    '@type': /** @type {'WebPage'|'AboutPage'|'ContactPage'} */ (resolvePageType(page)),
    '@id': `${pageUrl}#webpage`,
    url: pageUrl,
    name: page.title,
    isPartOf: { '@id': siteId }
  };
  /** @type {PageNode} */
  const pageNode = node;

  if (page.description) {
    pageNode.description = page.description;
  } else {
    pageNode.description = siteData.defaultDescription;
  }

  if (ABOUT_ORG_NAMES.has(page.name) || page.type === 'legal') {
    pageNode.about = { '@id': orgId };
  }
  if (MAIN_ENTITY_ORG_NAMES.has(page.name)) {
    pageNode.mainEntity = { '@id': orgId };
  }

  /** @type {Array<import('schema-dts').BreadcrumbList>} */
  const extras = [];
  if (page.route !== '/') {
    const breadcrumb = buildBreadcrumb(page, appHost);
    // schema-dts marks @id optional, but buildBreadcrumb always sets it.
    const breadcrumbId = /** @type {String} */ (breadcrumb['@id']);
    pageNode.breadcrumb = { '@id': breadcrumbId };
    extras.push(breadcrumb);
  }

  return { node: pageNode, extras };
}

/**
 * Sanity-check one page's built graph before it's serialized. This is the
 * "shift-left" layer -- it runs on every local build via loadJsonLd() and
 * prints a warning, so a regression shows up the moment you edit
 * site-data.json or extend the builder registry, not weeks later in CI.
 * Pass strict = true (from a CI-only code path) to turn the same checks
 * into a hard build failure instead.
 *
 * Checks are deliberately structural/self-referential -- "does this graph
 * make internal sense" -- not spec compliance. Spec/consumption correctness
 * (does Google/an LLM crawler accept this) is a separate, heavier check
 * that belongs in CI against the built HTML; see README notes.
 *
 * The graph nodes are heterogeneous schema.org objects (and schema-dts
 * leaf types carry no index signature), so the element type is
 * intentionally loose -- this function only inspects '@type', 'name'
 * and 'url'.
 *
 * @param {{ '@context': String, '@graph': any[] }} graph - the island object for one page.
 * @param {String} pageName - for warning/error messages.
 * @param {Boolean} strict - throw instead of warn.
 */
function validateGraph (graph, pageName, strict = false) {
  const issues = [];
  const ids = new Set(graph['@graph'].map(n => n['@id']).filter(Boolean));
 
  // Walk the whole graph looking for single-key @id reference stubs that
  // don't resolve to an actual node with that @id in this same graph.
  // Given the fan-out design (sharedNodes spread into every page), this
  // should never fire -- if it does, someone broke the "always inline the
  // shared nodes" contract, e.g. by referencing an org by @id without also
  // including it in the page's graph list.
  /**
   * @param {unknown} obj
   */
  const walk = (obj) => {
    if (Array.isArray(obj)) return obj.forEach(walk);
    if (obj && typeof obj === 'object') {
      const rec = /** @type {Record<string, unknown>} */ (obj);
      const keys = Object.keys(rec);
      if (keys.length === 1 && keys[0] === '@id' && !ids.has(rec['@id'])) {
        issues.push(`dangling @id reference: ${rec['@id']}`);
      } else {
        Object.values(rec).forEach(walk);
      }
    }
  };
  walk(graph['@graph']);
 
  /** @type {Array<Record<string, any>>} */
  const nodes = graph['@graph'];
  for (const node of nodes) {
    if (!node['@type']) {
      issues.push(`node missing @type: ${JSON.stringify(node).slice(0, 80)}`);
    }
    // Container nodes carry their identifying data on child items (e.g. a
    // BreadcrumbList holds name/url inside its itemListElement entries), so
    // the top-level name/url check doesn't apply to them.
    if (!CONTAINER_TYPES.includes(node['@type']) && !node.name && !node.url) {
      issues.push(`${node['@type'] || 'node'} has neither name nor url`);
    }
  }
 
  if (issues.length) {
    const message = `${pageName}: ${issues.join('; ')}`;
    if (strict) {
      throw new Error(message);
    }
    log('jsonld', message, 'warn');
  }
}

/**
 * Build the full island (shared nodes + page node) for one page.
 *
 * @param {PageEntry} page - the page entry from siteData.pages.
 * @param {SiteData} siteData - global site-data.json.
 * @param {Array<import('schema-dts').Organization|import('schema-dts').WebSite>} sharedNodes - [Organization, WebSite] nodes, shared by reference.
 * @returns {{ '@context': String, '@graph': any[] }|null} The island object, or null to skip.
 */
function buildPageGraph (page, siteData, sharedNodes) {
  if (SKIP_TYPES.has(page.type)) {
    return null;
  }
  const { node, extras } = buildPageNode(page, siteData);
  return {
    '@context': 'https://schema.org',
    '@graph': [...sharedNodes, node, ...extras]
  };
}

/**
 * Build the { pageName: islandMarkup } map for every renderable page.
 *
 * @param {String} dataDir - the directory containing site-data.json.
 * @param {Object} [options]
 * @param {Boolean} [options.strict] - fail the build instead of warning
 *   (wire this to a CI-only flag, e.g. args.ci in index.js).
 * @returns {Promise<{ [pageName: string]: string }>} Hash of page.name -> <script> markup (only for pages that get one).
 */
export async function loadJsonLd (dataDir, { strict = false } = {}) {
  const siteData = /** @type {SiteData} */ (await loadSiteData(dataDir));
  const sharedNodes = [buildOrganization(siteData), buildWebsite(siteData)];

  /** @type {Record<String, String>} */
  const jsonld = {};
  for (const page of Object.values(siteData.pages)) {
    const graph = buildPageGraph(page, siteData, sharedNodes);
    if (!graph) continue;

    validateGraph(graph, page.name, strict);

    // Note: <script type="application/ld+json"> is inert data, not
    // executable script -- CSP's script-src does not govern it, so this
    // doesn't need (and won't break under) the CSP hashing in html.js.
    jsonld[page.name] = `<script type="application/ld+json">${JSON.stringify(graph)}</script>`;
  }

  return jsonld;
}