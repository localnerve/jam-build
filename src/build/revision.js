/**
 * revision assets for far-future expires control.
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
import fsp from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { src, dest, through, pipeline, File } from 'node-build-stream';
import { log } from './utils.js';

/** Fixed hash length used in fingerprinted filenames (matches rollup's [hash:10]). */
const HASH_LEN = 10;

/** Matches an already-fingerprinted filename suffix, `-<10 hex chars>` before the extension. */
const PRE_REVVED = new RegExp(`-[0-9a-f]{${HASH_LEN}}$`);

/** Files that are never fingerprinted in pass 1 (css is handled in pass 2). */
const SKIP_BASENAMES = new Set([ 'robots.txt', 'llms.txt', 'sitemap.xml' ]);

/**
 * A manifest mapping original asset paths (relative to dist) to their
 * fingerprinted names, e.g. `{ "images/logo.svg": "images/logo-a1b2c3d4e5.svg" }`.
 *
 * @typedef {Record<string, string>} Manifest
 */

/**
 * Short SHA-256 hex digest of a buffer.
 *
 * @param {Buffer} buf The bytes to hash.
 * @returns {string} A 10-hex-char content hash.
 */
function contentHash (buf) {
  return createHash('sha256').update(buf).digest('hex').slice(0, HASH_LEN);
}

/**
 * True when a dist-relative path should NOT be fingerprinted in pass 1:
 * html/css (rewritten later), static root files, any manifest.json, the
 * .well-known tree, and already-fingerprinted names.
 *
 * @param {string} relative Path of the file relative to dist/.
 * @returns {boolean} True when the file is excluded from fingerprinting.
 */
function skipFingerprint (relative) {
  const name = path.basename(relative);
  if (name.endsWith('.html') || name.endsWith('.css')) return true;
  if (SKIP_BASENAMES.has(name)) return true;
  if (name.endsWith('manifest.json')) return true;
  if (relative.startsWith(path.join('.well-known', path.sep))) return true;
  const stem = name.replace(/\.[^.]+$/, '');
  return PRE_REVVED.test(stem);
}

/**
 * Load a JSON manifest from disk, resolving to {} when absent or invalid.
 *
 * @param {string} manifestFile Absolute path of the manifest to load.
 * @returns {Promise<Manifest>} The parsed manifest, or {} when unreadable.
 */
async function loadManifest (manifestFile) {
  try {
    return /** @type {Manifest} */ (JSON.parse(
      await fsp.readFile(manifestFile, 'utf8')));
  } catch {
    return {};
  }
}

/**
 * Build the site-rooted reference tokens from a manifest:
 * `/images/logo.svg` → `/images/logo-a1b2c3d4e5.svg`.
 *
 * @param {Manifest} manifest The original→fingerprinted map.
 * @returns {Record<string, string>} Token → replacement pairs.
 */
function refTokens (manifest) {
  const refs = /** @type {Record<string, string>} */ ({});
  for (const [from, to] of Object.entries(manifest)) {
    refs[`/${from}`] = `/${to}`;
  }
  return refs;
}

/**
 * Replace every occurrence of each reference token in a string. Each manifest
 * entry maps an original name straight to its final fingerprinted name (rollup
 * output is never re-fingerprinted), so a single pass always suffices.
 *
 * @param {string} text The source text.
 * @param {Record<string, string>} refs Token → replacement map.
 * @returns {string} The rewritten text.
 */
function replaceAllTokens (text, refs) {
  let out = text;
  for (const [token, replacement] of Object.entries(refs)) {
    if (out.includes(token)) {
      out = out.split(token).join(replacement);
    }
  }
  return out;
}

/**
 * Write a manifest object to disk as pretty-printed JSON via a one-file stream.
 *
 * @param {string} dist The dist root directory (cwd-relative).
 * @param {Manifest} manifest The manifest to write.
 * @returns {Promise<void>} Resolves when the file is written.
 */
async function writeManifest (dist, manifest) {
  const mf = new File({ path: `${dist}/rev-manifest.json` });
  mf.contents = `${JSON.stringify(manifest, null, 2)}\n`;
  await pipeline(Readable.from([mf]), dest(dist));
}

/**
 * Fingerprint every non-html/css asset in dist/ and emit rev-manifest.json.
 * 
 * @param {Object} settings - build settings.
 * @param {String} settings.dist - dir root of dist production files.
 * @param {Boolean} settings.prod - True if production, false otherwise.
 */
export async function assetRevision (settings) {
  const { prod, dist } = settings;

  if (!prod) return;

  const manifest = /** @type {Manifest} */ ({});

  await pipeline(
    src(`${dist}/**`),
    through(async file => {
      const relative = path.relative(dist, file.path);
      if (skipFingerprint(relative)) return file; // passes through untouched
      const oldPath = file.path;
      const name = path.basename(file.path);
      const stem = name.replace(/\.[^.]+$/, '').replace(PRE_REVVED, '');
      const newRelative = `${path.dirname(relative) === '.' ? '' : `${path.dirname(relative)}/`}${stem}-${contentHash(/** @type {Buffer} */ (file.contents))}${path.extname(name)}`;
      manifest[relative] = newRelative;
      file.path = path.join(dist, newRelative);
      await fsp.unlink(oldPath).catch(() => {});
      return file;
    }, 'fingerprint'),
    dest(dist)
  );

  await writeManifest(dist, manifest);
  log('build-rev', `fingerprinted ${Object.keys(manifest).length} assets`);
}

/**
 * Replace all assets referenced in css with their revisioned references.
 * Then revision the css files with the new references.
 * Merge the new revisions into the main rev-manifest file.
 *
 * @param {Object} settings - build settings.
 * @param {String} settings.dist - dir root of dist production files.
 * @param {Boolean} settings.prod - True if production, false otherwise.
 */
export async function cssRevision (settings) {
  const { prod, dist } = settings;

  if (!prod) return;

  const manifest = await loadManifest(`${dist}/rev-manifest.json`);
  const refs = refTokens(manifest);
  const updated = /** @type {Manifest} */ ({});
  let count = 0;

  await pipeline(
    src(`${dist}/**/*.css`),
    through(async file => {
      // Rewrite url() references, then fingerprint every css file (matching the
      // original pipeline: all css is hashed, whether or not refs were found).
      const rewritten = replaceAllTokens(/** @type {string} */ (file.contents.toString()), refs);
      file.contents = Buffer.from(rewritten);

      const relative = path.relative(dist, file.path);
      const oldPath = file.path;
      const name = path.basename(file.path);
      const stem = name.replace(/\.[^.]+$/, '').replace(PRE_REVVED, '');
      const newRelative = `${path.dirname(relative) === '.' ? '' : `${path.dirname(relative)}/`}${stem}-${contentHash(/** @type {Buffer} */ (file.contents))}${path.extname(name)}`;

      file.path = path.join(dist, newRelative);
      await fsp.unlink(oldPath).catch(() => {});
      updated[relative] = newRelative;
      count += 1;
      return file;
    }, 'css-rev'),
    dest(dist)
  );

  await writeManifest(dist, { ...manifest, ...updated });
  log('build-rev', `revised ${count} css file${count === 1 ? '' : 's'}`);
}

/**
 * Update the html pages with the asset revisions.
 * Must run after assetRevision, cssRevision.
 * 
 * @param {Object} settings - build settings.
 * @param {String} settings.dist - dir root of dist production files.
 * @param {Boolean} settings.prod - True if production, false otherwise.
 * @param {String} settings.jsManifestFilename - The js revision manifest output from rollup pass.
 */
export async function pageRevision (settings) {
  const { prod, dist, jsManifestFilename } = settings;

  if (!prod) return;

  const mergedManifest = {
    ...await loadManifest(`${dist}/rev-manifest.json`),
    .../** @type {Manifest} */ (JSON.parse(
      await fsp.readFile(`${dist}/${jsManifestFilename}`, 'utf8')))
  };

  const refs = refTokens(mergedManifest);
  let count = 0;

  await pipeline(
    src(`${dist}/**/*.html`),
    through(file => {
      file.contents = Buffer.from(
        replaceAllTokens(/** @type {string} */ (file.contents.toString()), refs));
      count += 1;
      return file;
    }, 'page-rev'),
    dest(dist)
  );
  log('build-rev', `rewrote asset refs in ${count} html page${count === 1 ? '' : 's'}`);
}

export default {
  assetRevision,
  cssRevision,
  pageRevision
};
