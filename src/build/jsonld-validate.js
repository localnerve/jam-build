/**
 * Layer 3 of the JSON-LD defense plan: validate the structured data that was
 * actually emitted into the built HTML, against the live schema.org
 * vocabulary + Google Rich Results requirements, using Adobe's
 * @adobe/structured-data-validator.
 *
 * This catches what the in-build checks (validateGraph) cannot: schema.org
 * vocabulary drift, and consumer-level requirements like "this type requires
 * this property" -- checked against the real built markup, not the source JS.
 *
 * Usage: npm run jsonld:validate [distDir]
 *   Default distDir is 'dist'. Run AFTER `npm run build`.
 *
 * Exit codes: 0 = no errors (warnings are printed but do not fail),
 *             1 = schema validation errors or unparseable islands.
 *
 * The schema.org JSON-LD vocabulary is fetched from schema.org on each run
 * (it is the single source of truth for "what the spec says today"). A copy
 * is cached in tmp/ and used as a fallback when the network is unavailable,
 * so the check degrades to last-known-vocabulary rather than failing.
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
import fs from 'node:fs/promises';
import path from 'node:path';
import Validator from '@adobe/structured-data-validator';
import { log } from './utils.js';

const owner = 'jsonld-validate';
const SCHEMA_URL = 'https://schema.org/version/latest/schemaorg-all-https.jsonld';
const SCHEMA_CACHE = path.resolve('tmp', 'schemaorg-latest.json');

/**
 * Load the schema.org vocabulary, preferring a fresh fetch and falling back
 * to the local cache when the network is unavailable.
 *
 * @returns {Promise<Object>} The schemaorg-all-https.jsonld document.
 */
async function loadSchema () {
  try {
    const schema = await (await fetch(SCHEMA_URL)).json();
    await fs.mkdir(path.dirname(SCHEMA_CACHE), { recursive: true });
    await fs.writeFile(SCHEMA_CACHE, JSON.stringify(schema));
    return schema;
  } catch {
    log(owner, `schema.org fetch failed -- using cached copy at ${path.relative(process.cwd(), SCHEMA_CACHE)}`, 'warn');
    return JSON.parse(await fs.readFile(SCHEMA_CACHE, 'utf8'));
  }
}

/**
 * Extract every application/ld+json island from an html document and parse
 * it. Handles both quoted and attribute-quote-stripped (minified) markup.
 *
 * @param {String} html - a full built html page.
 * @returns {{ islands: Object[], invalid: Array<String> }} Parsed islands plus error strings for any that fail to parse.
 */
function extractIslands (html) {
  const re = /<script\s+type="?application\/ld\+json"?>([\s\S]*?)<\/script>/g;
  /** @type {Object[]} */
  const islands = [];
  /** @type {String[]} */
  const invalid = [];
  let match;
  while ((match = re.exec(html))) {
    try {
      islands.push(JSON.parse(match[1]));
    } catch (e) {
      invalid.push(`island is not valid JSON: ${e.message}`);
    }
  }
  return { islands, invalid };
}

/**
 * Flatten an island into the root-type map shape (@marbec/web-auto-extractor
 * output format) that @adobe/structured-data-validator expects. Islands use
 * a single "@graph" array; pages without one are treated as a bare node.
 *
 * @param {Object} island - one parsed application/ld+json document.
 * @returns {{ jsonld: Record<String, any[]> }} The wae-style root-type map.
 */
function toWaeShape (island) {
  const nodes = Array.isArray(island['@graph']) ? island['@graph'] : [island];
  /** @type {Record<String, any[]>} */
  const jsonld = {};
  for (const node of nodes) {
    const type = node?.['@type'] || 'Unknown';
    (jsonld[type] ||= []).push(node);
  }
  return { jsonld };
}

/**
 * Validate every built page in distDir and report results.
 *
 * @param {String} distDir - the directory containing the built html pages.
 * @returns {Promise<Number>} The process exit code (0 clean, 1 failures).
 */
async function validateDist (distDir) {
  const validator = new Validator(await loadSchema());

  const files = (await fs.readdir(distDir))
    .filter(f => f.endsWith('.html'))
    .sort();

  let errors = 0;
  let warnings = 0;
  let islandsChecked = 0;

  for (const file of files) {
    const html = await fs.readFile(path.join(distDir, file), 'utf8');
    const { islands, invalid } = extractIslands(html);

    if (!islands.length && !invalid.length) continue; // no structured data on this page

    for (const problem of invalid) {
      errors++;
      log(owner, `${file}: ${problem}`, 'error', file);
    }

    for (const island of islands) {
      islandsChecked++;
      const issues = await validator.validate(toWaeShape(island));
      for (const issue of issues.filter(i => i.severity === 'ERROR')) {
        errors++;
        log(owner, `${issue.issueMessage} (${JSON.stringify(issue.path)})`, 'error', file);
      }
      for (const issue of issues.filter(i => i.severity === 'WARNING')) {
        warnings++;
        log(owner, `${issue.issueMessage} (${JSON.stringify(issue.path)})`, 'warn', file);
      }
    }
  }

  const summary = `${islandsChecked} island(s) checked, ${errors} error(s), ${warnings} warning(s)`;
  if (errors) {
    log(owner, `FAIL -- ${summary}`, 'error');
    return 1;
  }
  log(owner, `PASS -- ${summary}`);
  return 0;
}

// CLI entry: `node src/build/jsonld-validate.js [distDir]`
const distDir = process.argv[2] || 'dist';
try {
  const code = await validateDist(distDir);
  process.exitCode = code;
} catch (e) {
  log(owner, `FAIL -- unable to validate ${distDir}: ${e.message}`, 'error');
  process.exitCode = 1;
}
