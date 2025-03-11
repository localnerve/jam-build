/**
 * Various copy operations.
 * 
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */
import gulp from 'gulp';

/**
 * Copy all files from srcDir to dist, copy favicon assets to dist.
 * 
 * @param {Object} settings - build settings.
 * @param {Array} settings.files - files to copy.
 * @param {String} settings.destDir - root dir for distribution.
 * @param {Object} [settings.options] - options for gulp.src.
 * @returns {Stream} gulp stream
 */
export function fileCopy (settings) {
  const { destDir, files, options = {}} = settings;

  return gulp.src(files, options).pipe(gulp.dest(destDir));
}

/**
 * Generic directory copy.
 *
 * @param {Object} settings - build settings.
 * @param {String} settings.srcDir - srcDir to copy.
 * @param {String} settings.destDir - destDir to copy.
 * @returns {Stream} gulp stream
 */
export function dirCopy (settings) {
  const { srcDir, destDir } = settings;
  return gulp.src([
    `${srcDir}/**/*`
  ], {
    encoding: false
  })
    .pipe(gulp.dest(destDir));
}

export default {
  dirCopy,
  fileCopy
};
