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
import path from 'node:path';
import { Transform } from 'node:stream';
import fs from 'node:fs/promises';
import gulp from 'gulp';
import gulpResponsive from '@localnerve/gulp-responsive';
import { optimize as svgOptimize } from 'svgo';
import decodeJpeg, { init as initJpegDecode } from '@jsquash/jpeg/decode.js';
import decodePng, { init as initPngDecode } from '@jsquash/png/decode.js';
import encodeWebp, { init as initWebpEncode } from '@jsquash/webp/encode.js';
import { loadSiteData } from './data.js';

const WASM_JPEG_DECODE = 'node_modules/@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm';
const WASM_PNG_DECODE = 'node_modules/@jsquash/png/codec/pkg/squoosh_png_bg.wasm';
const WASM_WEBP_ENCODE = 'node_modules/@jsquash/webp/codec/enc/webp_enc.wasm';

/**
 * Check skip condition for vinyl stream object.
 * Not right extension, empty file, or stream, then skip.
 * 
 * @param {VinylFile} file - Vinyl file object passing thru
 * @param {Array} exts - Array of dot exts to check for
 * @returns {Boolean} true if not in exts, empty or stream, false otherwise
 */
function checkSkip (file, exts) {
  return !exts.includes(path.extname(file.path).toLowerCase()) || !file.contents.toString('utf8') || file.isStream();
}

/**
 * Handle an error in a gulp transform stream.
 * 
 * @param {String} owner - The function owner
 * @param {VinylFile} file - Vinyl file object passing thru
 * @param {Function} next - The transform callback
 * @param {Error} error - The error
 */
function handleError (owner, file, next, error) {
  const colors = { yellow: '\x1b[33m', red: '\x1b[31m', reset: '\x1b[0m' };
  const filepath = path.relative(process.cwd(), file.path);
  const message = error.message || error;

  if (message) {
    console.error(`${colors.yellow}${owner}:${colors.red}`, message.replace( // eslint-disable-line no-console
      'Line:', `${colors.reset}File: ${filepath}\nLine:`
    ).replace(/\n/g, '\n\t').trim());
  }

  next(null);
}

/**
 * Convert jpeg and png raster images to webp.
 * 
 * @param {Object} settings - build settings
 * @param {Object} data - The siteData data object
 * @param {String} settings.distImages - dist root dir of images
 * @param {Object} [settings.webpOptions] - optional webp encoder options at https://github.com/jamsinclair/jSquash/blob/main/packages/webp/meta.ts
 */
async function toWebp (settings, data) {
  const { distImages, webpOptions } = settings;

  const jpegWasmBuffer = await fs.readFile(WASM_JPEG_DECODE);
  const jpegWasmModule = await WebAssembly.compile(jpegWasmBuffer);
  await initJpegDecode(jpegWasmModule);

  const pngWasmBuffer = await fs.readFile(WASM_PNG_DECODE);
  const pngWasmModule = await WebAssembly.compile(pngWasmBuffer);
  await initPngDecode(pngWasmModule);

  const webpWasmBuffer = await fs.readFile(WASM_WEBP_ENCODE);
  const webpWasmModule = await WebAssembly.compile(webpWasmBuffer);
  await initWebpEncode(webpWasmModule);

  async function transformToWebp (exts, decoder, file, encoding, next) {
    if (checkSkip(file, exts)) return next(null, file);
    if (file.isBuffer()) {
      try {
        const originalFile = file.path;
        const name = path.parse(file.relative).name;
        const nameParts = name.split('-');
        const key = nameParts.slice(0,2).join('-');
        const width = nameParts.slice(2,3)[0];

        const imageData = await decoder(file.contents);
        file.contents = Buffer.from(await encodeWebp(imageData, webpOptions));

        for (const ext of exts) {
          file.path = file.path.replace(ext, '.webp');
          if (originalFile !== file.path) {
            const val = data.images?.[key]?.[width];
            if (val) {
              val.basename = file.basename;
              val.mimeType = 'image/webp';
            }
            break;
          }
        }

        if (file.stat) {
          file.stat.atime = file.stat.mtime = file.stat.ctime = new Date();
        }
        next(null, file);
      } catch (error) {
        handleError('toWebp', file, next, error);
      }
    }
  }

  return gulp.src(`${distImages}/**`, { encoding: false })
    .pipe(new Transform({
      objectMode: true,
      transform: transformToWebp.bind(null, ['.jpeg', '.jpg'], decodeJpeg)
    }))
    .pipe(new Transform ({
      objectMode: true,
      transform: transformToWebp.bind(null, ['.png'], decodePng)
    }))
    .pipe(gulp.dest(distImages));
}

/**
 * Optimize svgs.
 * 
 * @param {Object} settings - build settings
 * @param {String} settings.distImages - dist root dir of images
 */
function optimizeSvg (settings) {
  const { prod, distImages, svgoOptions } = settings;
  if (prod) {
    const svgoTransform = new Transform({
      objectMode: true,
      transform: async (file, encoding, next) => {
        if (checkSkip(file, ['.svg'])) return next(null, file);
        if (file.isBuffer()) {
          try {
            const result = await svgOptimize(file.contents.toString('utf8'), {
              path: file.path,
              ...svgoOptions
            });
            file.contents = Buffer.from(result.data);
            next(null, file);
          } catch (error) {
            handleError('optimizeSvg', file, next, error);
          }
        }
      }
    });

    return gulp.src(`${distImages}/**`, { encoding: false })
      .pipe(svgoTransform)
      .pipe(gulp.dest(distImages));
  } else {
    return Promise.resolve();
  }
}

/**
 * Generate responsive images.
 * 
 * @param {Object} settings - build settings
 * @param {String} settings.distImages - dist root dir of images
 * @param {Object} settings.responsiveConfig - The responsive config
 * @param {Object} data - The siteData data object
 */
function responsive (settings, data) {
  const { distImages, responsiveConfig } = settings;

  if (Object.keys(responsiveConfig).length > 0) {
    const mimeTypes = {
      '.avif': 'image/avif',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.png': 'image/png',
      '.svg': 'image/svg+xml',
      '.webp': 'image/webp'
      // add here as needed
    };

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
          data.images[key][config.width] = {
            basename: newFile.basename,
            mimeType: mimeTypes[newFile.extname]
          };
        }
      }))
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
    toWebp.bind(null, settings, data),
    optimizeSvg.bind(null, settings)
  );
}

export default {
  getImageSequence
};
