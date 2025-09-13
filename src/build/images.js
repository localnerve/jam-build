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
import PluginError from 'plugin-error';
import { optimize as svgOptimize } from 'svgo';
import gulpResponsive from '@localnerve/gulp-responsive';
import pngOptimize, { init as initPngOptimize } from '@jsquash/oxipng/optimise.js';
import decodeJpeg, { init as initJpegDecode } from '@jsquash/jpeg/decode.js';
import encodeJpeg, { init as initJpegEncode } from '@jsquash/jpeg/encode.js';
import decodePng, { init as initPngDecode } from '@jsquash/png/decode.js';
import encodeWebp, { init as initWebpEncode } from '@jsquash/webp/encode.js';
import { loadSiteData } from './data.js';

const WASM_JPEG_DECODE = 'node_modules/@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm';
const WASM_JPEG_ENCODE = 'node_modules/@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm';
const WASM_PNG_DECODE = 'node_modules/@jsquash/png/codec/pkg/squoosh_png_bg.wasm';
const WASM_OXIPNG_OPT = 'node_modules/@jsquash/oxipng/codec/pkg/squoosh_oxipng_bg.wasm';
const WASM_WEBP_ENCODE = 'node_modules/@jsquash/webp/codec/enc/webp_enc.wasm';

/**
 * Initialize the wasm modules.
 */
async function initWasmModules () {
  const jpegDecWasmBuffer = await fs.readFile(WASM_JPEG_DECODE);
  const jpegDecWasmModule = await WebAssembly.compile(jpegDecWasmBuffer);
  await initJpegDecode(jpegDecWasmModule);

  const jpegEncWasmBuffer = await fs.readFile(WASM_JPEG_ENCODE);
  const jpegEncWasmModule = await WebAssembly.compile(jpegEncWasmBuffer);
  await initJpegEncode(jpegEncWasmModule);

  const pngDecWasmBuffer = await fs.readFile(WASM_PNG_DECODE);
  const pngDecWasmModule = await WebAssembly.compile(pngDecWasmBuffer);
  await initPngDecode(pngDecWasmModule);

  const oxipngWasmBuffer = await fs.readFile(WASM_OXIPNG_OPT);
  const oxipngWasmModule = await WebAssembly.compile(oxipngWasmBuffer);
  await initPngOptimize(oxipngWasmModule);

  const webpEncWasmBuffer = await fs.readFile(WASM_WEBP_ENCODE);
  const webpEncWasmModule = await WebAssembly.compile(webpEncWasmBuffer);
  await initWebpEncode(webpEncWasmModule);
}

/**
 * Check skip condition for vinyl stream object.
 * Not right extension, empty file, or stream, then skip.
 * 
 * @param {VinylFile} file - Vinyl file object passing thru
 * @param {Array} exts - Array of dot exts to check for
 * @returns {Boolean} true if not in exts, empty or stream, false otherwise
 */
function checkSkip (file, exts) {
  return !exts.includes(file.extname.toLowerCase()) || !file.contents.toString('utf8') || file.isStream() || file.isNull();
}

/**
 * Simple message logger.
 * 
 * @param {String} owner - The function owner
 * @param {VinylFile} file - Vinyl file object passing thru
 * @param {String} message - The message
 * @param {String} [method] - console method, defaults to 'log'
 */
function log (owner, file, message, method = 'log') {
  const colors = { magenta: '\x1b[35m', yellow: '\x1b[33m', red: '\x1b[31m', green: '\x1b[32m', reset: '\x1b[0m' };
  const filepath = path.relative(process.cwd(), file.path);

  const now = new Date();
  const TN = i => i < 10 ? `0${i}` : i;
  const timestring = `${TN(now.getHours())}:${TN(now.getMinutes())}:${TN(now.getSeconds())}`;

  // eslint-disable-next-line no-console
  console[method](`[${colors.magenta}${timestring}${colors.reset}] \
${owner}: ${method === 'log' ? colors.green : colors.red}File ${filepath} - ${colors.yellow}${message}${colors.reset}`
  );
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
  const colors = { reset: '\x1b[0m' };
  const filepath = path.relative(process.cwd(), file.path);
  let message = error.message || error;

  if (message) {
    message = message
      .replace('Line:', `${colors.reset}File: ${filepath}\nLine:`)
      .replace(/\n/g, '\n\t').trim();
    log(owner, file, message, 'error');
  }

  next(new PluginError(owner, message));
}

/**
 * Transform to convert older raster images to webp.
 * Only supports jpg and png for now.
 * webp options: https://github.com/jamsinclair/jSquash/blob/main/packages/webp/meta.ts
 * 
 * @param {Object} settings - build settings
 * @param {Object} [settings.webpOptions] - webp encoder options
 * @param {Object} data - The siteData data object
 */
function toWebp (settings, data) {
  const { webpOptions } = settings;
  const exts = ['.jpg', '.jpeg', '.png'];
  const decoders = [decodeJpeg, decodeJpeg, decodePng];
  const pluginName = '@localnerve/to-webp';

  return new Transform({
    objectMode: true,
    transform: async (file, encoding, next) => {
      if (checkSkip(file, exts)) return next(null, file);
      if (file.isBuffer()) {
        try {
          const decoderIndex = exts.indexOf(file.extname.toLowerCase());
          const originalFile = file.path;
          const originalExt = file.extname;
          const name = path.parse(file.relative).name;
          const nameParts = name.split('-');
          const key = nameParts.slice(0,2).join('-');
          const width = nameParts.slice(2,3)[0];

          const imageData = await decoders[decoderIndex](file.contents);
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

          log(pluginName, file, `${originalExt.slice(1)} converted to webp`);
          next(null, file);
        } catch (error) {
          handleError(pluginName, file, next, error);
        }
      }
    }
  });
}

/**
 * Transform to optimize svgs.
 * 
 * @param {Object} settings - build settings
 * @param {Object} settings.svgoOptions - svgo options object
 * @param {Boolean} settings.prod - true for production, false otherwise
 * @returns {Transform} A nodejs Transform object
 */
function optimizeSvg (settings) {
  const { prod, svgoOptions } = settings;
  const pluginName = '@localnerve/optimize-svg';

  if (prod) {
    return new Transform({
      objectMode: true,
      transform: async (file, encoding, next) => {
        if (checkSkip(file, ['.svg'])) return next(null, file);
        if (file.isBuffer()) {
          try {
            const result = await svgOptimize(file.contents.toString('utf8'), {
              ...svgoOptions,
              path: file.path
            });
            file.contents = Buffer.from(result.data);

            log(pluginName, file, 'svg optimized');
            next(null, file);
          } catch (error) {
            handleError(pluginName, file, next, error);
          }
        }
      }
    });
  }

  return new Transform({
    objectMode: true, transform: (file, enc, next) => next(null, file)
  });
}

/**
 * Transform to optimize jpegs.
 * mozjpeg options: https://github.com/jamsinclair/jSquash/blob/main/packages/jpeg/meta.ts
 * 
 * @param {Object} settings - build settings
 * @param {Object} [settings.mozjpegOptions] - mozjpeg optimization options
 * @param {Boolean} settings.prod - true for production, false otherwise
 * @returns {Transform} A nodejs Transform object
 */
function optimizeJpeg (settings) {
  const { prod, mozjpegOptions } = settings;
  const pluginName = '@localnerve/optimize-jpeg';

  if (prod) {
    return new Transform({
      objectMode: true,
      transform: async (file, encoding, next) => {
        if (checkSkip(file, ['.jpg', '.jpeg'])) return next(null, file);
        if (file.isBuffer()) {
          try {
            const imageData = await decodeJpeg(file.contents);
            file.contents = Buffer.from(await encodeJpeg(imageData, mozjpegOptions));

            log(pluginName, file, `${file.extname.slice(1)} optimized`);
            next(null, file);
          }
          catch (error) {
            handleError(pluginName, file, next, error);
          }
        }
      }
    });
  }

  return new Transform({
    objectMode: true, transform: (file, enc, next) => next(null, file)
  });
}

/**
 * Transform to optimize pngs.
 * oxipng options: https://github.com/jamsinclair/jSquash/blob/main/packages/oxipng/meta.ts
 * 
 * @param {Object} settings - build settings
 * @param {Object} [settings.oxipngOptions] - oxipng options
 * @param {Boolean} settings.prod - true for production, false otherwise
 */
function optimizePng (settings) {
  const { prod, oxipngOptions } = settings;
  const pluginName = '@localnerve/optimize-png';

  if (prod) {
    return new Transform({
      objectMode: true,
      transform: async (file, encoding, next) => {
        if (checkSkip(file, ['.png'])) return next(null, file);
        if (file.isBuffer()) {
          try {
            const imageData = await decodePng(file.contents);
            file.contents = Buffer.from(await pngOptimize(imageData, oxipngOptions));

            log(pluginName, file, `${file.extname.slice(1)} optimized`);
            next(null, file);
          }
          catch (error) {
            handleError(pluginName, file, next, error);
          }
        }
      }
    });
  }

  return new Transform({
    objectMode: true, transform: (file, enc, next) => next(null, file)
  });
}

/**
 * Transform to generate responsive images.
 * 
 * @param {Object} settings - build settings
 * @param {Object} settings.responsiveConfig - The responsive config
 * @param {Object} data - The siteData data object
 */
function responsive (settings, data) {
  const { responsiveConfig } = settings;

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

    return gulpResponsive(responsiveConfig, {
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
    });
  }

  return new Transform({
    objectMode: true, transform: (file, enc, next) => next(null, file)
  });
}

/**
 * Create the image processing steps.
 * 
 * @param {Object} settings - build settings.
 * @param {String} settings.dataDir - The data directory.
 * @param {String} settings.distImages - dist root dir of images
 * @param {String} settings.webImages - The directory to images as seen from the web.
 */
export async function getImageSequence (settings) {
  const { dataDir, webImages, distImages } = settings;

  const data = await loadSiteData(dataDir);
  data.images = { webImages: webImages.replace(/\/$/, '') };

  await initWasmModules();

  return gulp.series(
    function resizeAndOptimize () {
      return gulp.src(`${distImages}/**`, {
        encoding: false
      })
        .pipe(responsive(settings, data))
        .pipe(optimizeSvg(settings))
        .pipe(optimizeJpeg(settings))
        .pipe(optimizePng(settings))
        .pipe(gulp.dest(distImages));
    },
    function createDerivedImages () {
      return gulp.src(`${distImages}/**`, {
        encoding: false
      })
        .pipe(toWebp(settings, data))
        .pipe(gulp.dest(distImages));
    }
  );
}

export default {
  getImageSequence
};
