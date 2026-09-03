/**
 * html build steps.
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
import gulp from 'gulp';
import { Transform } from 'node:stream';
import gulpHtmlMin from 'gulp-html-minifier-terser';
import { hashstream, removeCspMeta, createCspHash } from '@localnerve/csp-hashes';
import { getEditableObjectCssText } from '@localnerve/editable-object';
import { extractTrustedTypesSources } from '@localnerve/trusted-types-rules';
import { log } from './utils.js';

const owner = 'build-html';

// web-component shadow styles
const editableObjectCspHash = createCspHash(await getEditableObjectCssText());

/**
 * Replace the `trusted-types` CSP directive in html meta tags with the
 * computed policy rules. Scans every built js file (app bundles, sw, and any
 * web components they register) for injection sinks and existing policy
 * registrations, then rewrites the placeholder directive in each page.
 * 
 * @param {String} dist - The dist directory containing the built assets.
 * @returns {Transform} A stream that rewrites the trusted-types directive.
 */
async function trustedTypesDirective (dist) {
  const files = await fs.readdir(dist, { encoding: 'utf8' });
  const sources = [];
  for (const file of files.filter(f => f.endsWith('.js'))) {
    const source = await fs.readFile(path.join(dist, file), { encoding: 'utf8' });
    sources.push({ path: file, source });
  }
  // the bootstrap policy is bundled inline into every page's html (not a
  // top-level dist js file), so include it in the audit for an accurate report
  const bootstrap = await fs.readFile(
    path.resolve('src/application/client/scripts/inline/trusted-types.js'), { encoding: 'utf8' });
  sources.push({ path: 'inline trusted-types.js (in html)', source: bootstrap });

  // 'jam-app-static' is registered at runtime by @localnerve/trusted-types-bootstrap
  // (node_modules, not scanned here), so it must be listed explicitly to stay in
  // the computed allowlist; component policies are still detected automatically.
  const report = extractTrustedTypesSources(sources, { policyNames: ['default', 'jam-app-static'] });

  // Do some console reporting
  for (const warning of report.warnings) {
    log(owner, `trusted-types audit: ${warning}`, 'warn');
  }
  log(
    owner,
    `trusted-types audit: sinks=${report.sinks.length} components=${report.webComponents.map(c => c.tag).join(', ') || 'none'} directive="${report.cspDirective}"`
  );

  return new Transform({
    objectMode: true,
    transform: (file, enc, done) => {
      const input = file?.contents?.toString();
      if (input) {
        file.contents = Buffer.from(
          input.replace(/trusted-types [^;"']+/g, report.cspDirective), enc);
      }
      done(null, file);
    }
  });
}

/**
 * Minify the html and handle CSP
 * 
 * @param {Object} settings - minify html parameters
 */
export async function minifyHtml (settings) {
  const { dist, prod } = settings;

  if (prod) {
    return gulp.src(`${dist}/**/*.html`)
      .pipe(gulpHtmlMin({
        minifyJS: true,
        minifyCSS: true,
        collapseWhitespace: true,
        removeAttributeQuotes: true,
        removeComments: true,
      }))
      .pipe(await trustedTypesDirective(dist))
      .pipe(hashstream({
        replace: true,
        callback: (p, hashes, s) => {
          const cssHashes = hashes.style.all.concat(editableObjectCspHash).join(' ');
          return s.replace(
            /script-src ([^;]+)/,
            `script-src $1 ${hashes.script.all.join(' ')}`
          ).replace(
            /style-src ([^;]+)/,
            `style-src $1 ${cssHashes}`
          );
        }
      }))
      .pipe(gulp.dest(dist));
  } else {
    return gulp.src(`${dist}/**/*.html`)
      .pipe(removeCspMeta())
      .pipe(gulp.dest(dist));
  }
}