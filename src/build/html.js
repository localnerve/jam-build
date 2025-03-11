/**
 * html build steps.
 * 
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */
import gulp from 'gulp';
import gulpHtmlMin from 'gulp-html-minifier-terser';
import { hashstream, removeCspMeta } from '@localnerve/csp-hashes';

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
          return s.replace(
            /script-src ([^;]+)/,
            `script-src $1 ${hashes.script.all.join(' ')}`
          ).replace(
            /style-src ([^;]+)/,
            `style-src $1 ${hashes.style.all.join(' ')}`
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