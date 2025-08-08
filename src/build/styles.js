/**
 * Bundle the main styles.
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
import { Transform } from 'node:stream';
import path from 'node:path';
import gulp from 'gulp';
import PluginError from 'plugin-error';
import gulpPostcss from 'gulp-postcss';
import * as dartSass from 'sass';
import autoprefixer from 'autoprefixer';
import assetFunctions from '@localnerve/sass-asset-functions';
import { loadSiteData } from './data.js';

/**
 * gulp-sass replacement plugin.
 * Bare minimum to just call sass.compile and produce the css file.
 * @returns {Function} A function to take the sass options and return a Transform stream.
 */
function streamSass () {
  const ss = options => new Transform({
    transform: (file, encoding, callback) => {
      if (file.isNull()) {
        callback(null, file);
        return;
      }
      if (path.basename(file.path).startsWith('_')) {
        callback();
        return;
      }
      try {
        const result = dartSass.compile(file.path, options);
        file.contents = Buffer.from(result.css);
        file.path = file.path.replace('.scss', '.css');
        if (file.stat) {
          file.stat.atime = file.stat.mtime = file.stat.ctime = new Date();
        }
        callback(null, file);
      }
      catch (error) {
        const filePath = (error.file === 'stdin' ? file.path : error.file) || file.path;
        const relativePath = path.relative(process.cwd(), filePath);
        const message = `${relativePath}\n${error.formatted || error.message}`;
      
        error.messageFormatted = message;
        error.messageOriginal = error.message;
        error.relativePath = relativePath;
      
        callback(new PluginError('streamSass', error));
      }
    },
    objectMode: true
  });

  ss.logError = function logError (error) {
    const message = new PluginError('sass', error.messageFormatted).toString();
    process.stderr.write(`${message}\n`);
    this.emit('end');
  };

  return ss;
}

/**
 * Compile the sass.
 * Applies autoprefixer.
 *
 * @param {Object} settings - build settings.
 * @param {String} settings.dist - dir root of dist production files.
 * @param {Boolean} settings.prod - True if production, false otherwise.
 * @param {String} settings.srcClient - dir root of src client files.
 * @param {String} settings.distImages - dir root of images in prod dist.
 * @param {String} settings.webImages - web root of images.
 * @param {String} settings.distFonts - dir root of fonts in prod dist.
 * @param {String} settings.webFonts - web root of fonts.
 * @param {String} settings.dataDir - The siteData directory.
 * @param {String} [settings.webStyles] - web root of styles, if supplied creates the styles data namespace.
 */
export async function createStyles (settings) {
  const {
    dist, srcClient, prod, distImages,
    webImages, distFonts, webFonts, dataDir, webStyles
  } = settings;
  const sassStream = streamSass();
  const data = await loadSiteData(dataDir);

  if (webStyles) {
    data.styles = { webStyles: webStyles.replace(/\/$/, '') };
  }

  return gulp.src([`${srcClient}/**/*.scss`, `!${srcClient}/**/inline/**`])
    .pipe(sassStream({
      style: prod ? 'compressed' : 'expanded', // compressed === css minifier output.
      loadPaths: [
        `${srcClient}/styles`,
        'node_modules/modern-normalize'
      ],
      functions: assetFunctions({
        images_path: distImages,
        http_images_path: webImages,
        fonts_path: distFonts,
        http_fonts_path: webFonts,
        data: {
          'nav-pages': Object.values(data.pages)
            .filter(page => page.type === 'nav' && page.template)
            .map(page => page.name),
          images: data.images
        }
      })
    }).on('error', sassStream.logError))
    .pipe(
      gulpPostcss([
        autoprefixer()
      ])
    )
    .pipe(gulp.dest(dist));
}

/**
 * Compile a sass string.
 * 
 * @param {String} sassText - The actual sass text string to compile.
 * @param {Object} options - The compile options.
 * @param {Boolean} options.prod - True if production, false otherwise.
 * @param {Array} options.loadPaths - Loadpaths for sass compile.
 * @returns {String} compiled css.
 */
export function compileStyles (sassText, options) {
  const { prod, loadPaths } = options;
  const result = dartSass.compileString(sassText, {
    style: prod ? 'compressed' : 'expanded', // compressed === css minifier output.
    loadPaths
  });
  return result.css;
}

export default {
  createStyles,
  compileStyles
};
