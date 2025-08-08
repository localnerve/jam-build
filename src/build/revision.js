/**
 * revision assets for far-future expires control.
 * 
 * Jam-build, a web application practical reference.
 * Copyright (c) 2025 Alex Grant <info@localnerve.com>, LocalNerve LLC
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
 *    by including the string: "Copyright (c) 2025 Alex Grant <info@localnerve.com>, LocalNerve LLC"
 *    in this material, copies, or source code of derived works.
 */
import fs from 'node:fs';
import gulp from 'gulp';
import rev from 'gulp-rev';
import revRewrite from 'gulp-rev-rewrite';
import revDel from 'gulp-rev-delete-original';
import filter from 'gulp-filter';

/**
 * Rev the assets and rewrite index.html
 * 
 * @param {Object} settings - build settings.
 * @param {String} settings.dist - dir root of dist production files.
 * @param {Boolean} prod - True if production, false otherwise.
 */
export function assetRevision (settings) {
  const { prod, dist } = settings;

  if (prod) {
    const assetFilter = filter([
      '**/*',
      '!**/*.html',
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
 * Update the html pages with the asset revisions.
 * Must run after assetRevision.
 * 
 * @param {Object} settings - build settings.
 * @param {String} settings.dist - dir root of dist production files.
 * @param {Boolean} prod - True if production, false otherwise.
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
  pageRevision,
  assetRevision
};
