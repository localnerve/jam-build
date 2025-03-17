/**
 * Build the images.
 * 
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */
import gulp from 'gulp';
import gulpResponsive from '@localnerve/gulp-responsive';
import gulpImageMin, {mozjpeg, optipng, svgo} from '@localnerve/gulp-imagemin';

/**
 * Generate responsive images
 * 
 * @param {Object} settings - build settings.
 * @param {String} settings.distImages - dist root dir of images.
 */
function responsive (settings) {
  const { distImages, responsiveConfig } = settings;

  if (Object.keys(responsiveConfig).length > 0) {
    return gulp.src(`${distImages}/**`, {
      encoding: false
    })
      .pipe(gulpResponsive(responsiveConfig, {
        errorOnUnusedConfig: false,
        errorOnUnusedImage: false,
        passThroughUnused : true
      }))
      .pipe(gulp.dest(distImages));
  }

  return Promise.resolve();
}

/**
 * Minify jpg, png, and svgs.
 * 
 * @param {Object} settings - build settings.
 * @param {String} settings.distImages - dist root dir of images.
 */
function imagemin (settings) {
  const { prod, distImages } = settings;
  if (prod) {
    return gulp.src(`${distImages}/**`, {
      encoding: false
    })
      .pipe(gulpImageMin([
        mozjpeg({quality: 65, progressive: true}),
        optipng({optimizationLevel: 5}),
        svgo({
          plugins: [
            { 
              name: 'cleanupIds',
              active: false
            }
          ]
        })
      ], { verbose: true }))
      .pipe(gulp.dest(distImages));
  }
  return Promise.resolve();
}

/**
 * Create the image processing steps.
 * 
 * @param {Object} settings - build settings.
 */
export function getImageSequence (settings) {
  return gulp.series(
    responsive.bind(null, settings),
    imagemin.bind(null, settings)
  );
}

export default {
  getImageSequence
};
