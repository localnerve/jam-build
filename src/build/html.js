/**
 * html build steps.
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
 * If not, see <https://www.gnu.org/licenses/>
 */
import gulp from 'gulp';
import gulpHtmlMin from 'gulp-html-minifier-terser';
import { hashstream, removeCspMeta, createCspHash } from '@localnerve/csp-hashes';
import { getEditableObjectCssText } from '@localnerve/editable-object';

// web-component shadow styles
const editableObjectCspHash = createCspHash(await getEditableObjectCssText());

/**
 * Minify the html and handle CSP
 * 
 * @param {Object} settings - minify html parameters
 */
export function minifyHtml (settings) {
  const { dist, prod } = settings;

  if (prod) {
    return gulp.src(`${dist}/**/*.html`)
      .pipe(gulpHtmlMin({
        minifyJS: true,
        minifyCSS: true,
        collapseWhitespace: true,
        removeAttributeQuotes: true,
        removeComments: true,
      }))
      .pipe(hashstream({
        replace: true,
        callback: (p, hashes, s) => {
          const cssHashes = hashes.style.all.concat(editableObjectCspHash).join(' ');
          return s.replace(
            /script-src ([^;]+)/,
            `script-src $1 ${hashes.script.all.join(' ')}`
          ).replace(
            /style-src ([^;]+)/,
            `style-src $1 ${cssHashes}`
          );
        }
      }))
      .pipe(gulp.dest(dist));
  } else {
    return gulp.src(`${dist}/**/*.html`)
      .pipe(removeCspMeta())
      .pipe(gulp.dest(dist));
  }
}