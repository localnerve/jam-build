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
 *    by including the string: "Copyright (c) 2025 Alex Grant <info@localnerve.com> (https://www.localnerve.com), LocalNerve LLC"
 *    in this material, copies, or source code of derived works.
 */
import gulp from 'gulp';
import { initWasmModules, responsive, optimize, transform } from '@localnerve/gulp-images';
import { loadSiteData } from './data.js';

/**
 * Create the image processing steps.
 * 
 * @param {Object} settings - build settings
 * @param {String} settings.dataDir - The data directory
 * @param {String} settings.distImages - dist root dir of images
 * @param {String} settings.webImages - The directory to images as seen from the web
 */
export async function getImageSequence (settings) {
  const { dataDir, webImages, distImages } = settings;

  const data = await loadSiteData(dataDir);
  data.images = { webImages: webImages.replace(/\/$/, '') };

  await initWasmModules();

  return gulp.series(
    function createResponsiveImages () {
      return gulp.src(`${distImages}/**`, {
        encoding: false
      })
        .pipe(responsive.responsive(settings, data.images))
        .pipe(gulp.dest(distImages));
    },
    function optimizeImages () {
      return gulp.src(`${distImages}/**`, {
        encoding: false
      })
        .pipe(optimize.svg(settings))
        .pipe(optimize.jpeg(settings))
        .pipe(optimize.png(settings))
        .pipe(gulp.dest(distImages));
    },
    function createDerivedFormats () {
      return gulp.src(`${distImages}/**`, {
        encoding: false
      })
        .pipe(transform.toWebp(settings, data.images))
        .pipe(gulp.dest(distImages));
    }
  );
}

export default {
  getImageSequence
};
