/**
 * Bundle the main styles.
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
import { series, src, dest, pipeline, through } from 'node-build-stream';
import * as dartSass from 'sass';
import postcss from 'postcss';
import autoprefixer from 'autoprefixer';
import assetFunctions from '@localnerve/sass-asset-functions';
import { loadSiteData } from './data.js';
import { getVersionBuildstamp, log } from './utils.js';

/**
 * Sass compile transform for the style pipeline — a node-build-stream through()
 * step replacing gulp-sass. Compiles each non-partial .scss entry with dart-sass
 * and appends a version/buildstamp comment so the css fingerprint changes every
 * build. Partial files (basename `_…`) are dropped: they still compile implicitly
 * via loadPaths when an entry imports them, but are never emitted as css.
 *
 * @param {String} appVersion - The application version string (for the buildstamp).
 * @param {Object} options - dart-sass `compile` options (style, loadPaths, functions).
 * @returns {(file: import('node-build-stream/file').File) => Promise<import('node-build-stream/file').File|null>} An async per-file transform for through().
 */
function sassCompile (appVersion, options) {
  return async function compileSass (file) {
    if (file.isNull()) {
      return file;
    }

    // Partials are compiled implicitly via loadPaths — never emit them.
    if (path.basename(file.path).startsWith('_')) {
      return null;
    }

    try {
      const result = dartSass.compile(file.path, options);
      const versionBuildStamp = `/*! ${getVersionBuildstamp(appVersion)} */`;
      // Append the stamp so the css is always unique per build (fingerprinting).
      file.contents = Buffer.concat([Buffer.from(result.css), Buffer.from(versionBuildStamp)]);
      file.path = file.path.replace('.scss', '.css');
      if (file.stat) {
        file.stat.atime = file.stat.mtime = file.stat.ctime = new Date();
      }
      return file;
    } catch (error) {
      const filePath = (error.file === 'stdin' ? file.path : error.file) || file.path;
      const relativePath = path.relative(process.cwd(), filePath);
      // Preserve dart-sass's formatted output (path + line + snippet) in the thrown
      // message; node-build-stream wraps it in a FileError naming the stage/file.
      throw new Error(`${relativePath}\n${error.formatted || error.message}`, { cause: error });
    }
  };
}

/**
 * PostCSS transform for the style pipeline. Runs each compiled css file through
 * autoprefixer as a pure node-build-stream through() step — replacing gulp-postcss.
 * Contents arrive as Buffers from sassCompile; they are processed as strings and
 * stored back as a Buffer (real vinyl File.contents rejects strings). Browserslist
 * is picked up from the project's .browserslistrc automatically.
 * 
 * @returns {Function} An async per-file transform for through().
 */
function postcssProcess () {
  return async function runPostcss (file) {
    if (file.isNull()) {
      return file;
    }

    const css = /** @type {Buffer} */ (file.contents).toString('utf8');
    const result = await postcss([autoprefixer()]).process(css, { from: file.path });
    // Real vinyl File.contents only accepts Buffer/Stream/null — not a string.
    file.contents = Buffer.from(result.css);
    return file;
  };
}

/**
 * Get the style processing sequence.
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
 * @param {String} settings.appVersion - The application version to append to the file for added fingerprint assurance.
 * @param {String} [settings.webStyles] - web root of styles, if supplied creates the styles data namespace.
 */
export async function getStyleSequence (settings) {
  const {
    appVersion, dist, srcClient, prod, distImages,
    webImages, distFonts, webFonts, dataDir, webStyles
  } = settings;
  const data = await loadSiteData(dataDir);

  if (webStyles) {
    data.styles = { webStyles: webStyles.replace(/\/$/, '') };
  }

  return series(
    async function createStyles () {
      let count = 0;
      await pipeline(
        src([`${srcClient}/**/*.scss`, `!${srcClient}/**/inline/**`]),
        through(sassCompile(appVersion, {
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
        }), 'sass'),
        through(postcssProcess()),
        through(file => { count += 1; return file; }, 'count'),
        dest(dist)
      );
      log('build-styles', `compiled ${count} stylesheet${count === 1 ? '' : 's'}`);
    }
  );
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
  getStyleSequence,
  compileStyles
};
