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
import fs from 'node:fs';
import { Transform } from 'node:stream';
import gulp from 'gulp';
import rev from 'gulp-rev';
import revRewrite from 'gulp-rev-rewrite';
import revDel from '@localnerve/gulp-rev-delete-original';
import filter from 'gulp-filter';

/**
 * Rev the assets and rewrite index.html
 * 
 * @param {Object} settings - build settings.
 * @param {String} settings.dist - dir root of dist production files.
 * @param {Boolean} settings.prod - True if production, false otherwise.
 */
export function assetRevision (settings) {
  const { prod, dist } = settings;

  if (prod) {
    const assetFilter = filter([
      '**/*',
      '!**/*.html',
      '!**/*.css', // not yet, must be done next step
      '!**/robots.txt',
      '!**/sitemap.xml',
      '!**/*manifest.json',
      '!**/*-+([a-f0-9]).*' // don't match any pre-revved
    ], { restore: true });

    return gulp.src(`${dist}/**`, {
      encoding: false
    })
      .pipe(assetFilter)
      .pipe(rev())
      .pipe(revDel())
      .pipe(gulp.dest(dist))
      .pipe(assetFilter.restore)
      .pipe(revRewrite())
      .pipe(gulp.dest(dist))
      .pipe(rev.manifest())
      .pipe(gulp.dest(dist));
  }

  return Promise.resolve();
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
export function cssRevision (settings) {
  const { prod, dist } = settings;

  if (prod) {
    const revManifestPath = `${dist}/rev-manifest.json`;
    const revManifest = fs.readFileSync(revManifestPath);

    return gulp.src(`${dist}/**/*.css`, { encoding: false })
      .pipe(revRewrite({ manifest: Buffer.from(revManifest) }))
      .pipe(rev())
      .pipe(revDel())
      .pipe(gulp.dest(dist))
      .pipe(rev.manifest({ base: dist }))
      .pipe(new Transform({
        objectMode: true,
        transform (file, enc, cb) {
          const existing = JSON.parse(revManifest);
          const incoming = JSON.parse(file.contents.toString());
          const merged = { ...existing, ...incoming };
          file.contents = Buffer.from(JSON.stringify(merged, null, 2));
          file.path = revManifestPath;
          cb(null, file);
        }
      }))
      .pipe(gulp.dest(dist));
  }

  return Promise.resolve();
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
export function pageRevision (settings) {
  const { prod, dist, jsManifestFilename } = settings;

  if (prod) {
    const jsManifest = fs.readFileSync(`${dist}/${jsManifestFilename}`);
    const revManifest = fs.readFileSync(`${dist}/rev-manifest.json`);

    const mergedManifest = {
      ...JSON.parse(revManifest.toString()),
      ...JSON.parse(jsManifest.toString())
    };

    const manifest = Buffer.from(JSON.stringify(mergedManifest));

    return gulp.src(`${dist}/**/*.html`)
      .pipe(revRewrite({ manifest }))
      .pipe(gulp.dest(dist));
  }

  return Promise.resolve();
}

export default {
  assetRevision,
  cssRevision,
  pageRevision
};
