/**
 * Build the images.
 * 
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */
import path from 'node:path';
import gulp from 'gulp';
import gulpResponsive from '@localnerve/gulp-responsive';
import gulpImageMin, {mozjpeg, optipng, svgo} from '@localnerve/gulp-imagemin';
import { loadSiteData } from './data.js';

/**
 * Generate responsive images
 * 
 * @param {Object} settings - build settings.
 * @param {String} settings.distImages - dist root dir of images.
 * @param {Object} settings.responsiveConfig - The responsive config.
 * @param {Object} data - The siteData data object.
 */
function responsive (settings, data) {
  const { distImages, responsiveConfig } = settings;

  if (Object.keys(responsiveConfig).length > 0) {
    return gulp.src(`${distImages}/**`, {
      encoding: false
    })
      .pipe(gulpResponsive(responsiveConfig, {
        errorOnUnusedConfig: false,
        errorOnUnusedImage: false,
        passThroughUnused : true,
        postprocess: (originalFile, config, newFile) => {
          const key = path.parse(originalFile.relative).name;
          if (!data.images[key]) {
            data.images[key] = {};
          }
          data.images[key][config.width] = newFile.relative;
        }
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
 * @param {String} settings.dataDir - The data directory.
 */
export async function getImageSequence (settings) {
  const { dataDir, webImages } = settings;
  const data = await loadSiteData(dataDir);
  data.images = { webImages };

  return gulp.series(
    responsive.bind(null, settings, data),
    imagemin.bind(null, settings)
  );
}

export default {
  getImageSequence
};
