/**
 * Build the images.
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
 *   by including the string: "Copyright (c) 2025 Alex Grant <info@localnerve.com> (https://www.localnerve.com), LocalNerve LLC"
 *   in this material, copies, or source code of derived works.
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
 * @param {String} settings.webImages - The directory to images as seen from the web.
 */
export async function getImageSequence (settings) {
  const { dataDir, webImages } = settings;
  const data = await loadSiteData(dataDir);
  data.images = { webImages: webImages.replace(/\/$/, '') };

  return gulp.series(
    responsive.bind(null, settings, data),
    imagemin.bind(null, settings)
  );
}

export default {
  getImageSequence
};
