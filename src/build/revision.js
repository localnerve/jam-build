/**
 * revision assets for far-future expires control.
 * 
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
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
  const { prod, dist } = settings;

  if (prod) {
    const manifest = fs.readFileSync(`${dist}/rev-manifest.json`);
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
