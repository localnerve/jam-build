/**
 * The Build Sequence.
 * 
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */

import gulp from 'gulp';
import { rimraf } from 'rimraf';
import { mkdirp } from 'mkdirp';

import { createSettings } from './settings.js';
import { createStyles } from './styles.js';
import { createScripts } from './scripts.js';
import { dirCopy } from './copy.js';
import { generateAssets } from './assets.js';
import { renderHtml } from './templates.js';
import { minifyHtml } from './html.js';
import { buildSwMain } from './sw.js';
import { getImageSequence } from './images.js';
import { assetRevision, pageRevision } from './revision.js';

/**
 * Main website build.
 * 
 * @param {Object} settings - build parameters.
 * @returns {Stream} A gulp series.
 */
async function createBuild (settings) {
  const imageProcessingSequence = await getImageSequence(settings.images);
  return gulp.series(
    rimraf.bind(null, settings.dist, {}),
    mkdirp.bind(null, settings.dist, {}),
    mkdirp.bind(null, settings.distImages, {}),
    dirCopy.bind(null, settings.copyImages),
    imageProcessingSequence,
    createStyles.bind(null, settings.styles),
    createScripts.bind(null, settings.scripts),
    generateAssets.bind(null, settings.assets),
    assetRevision.bind(null, settings.revision),
    renderHtml.bind(null, settings.templates),
    pageRevision.bind(null, settings.revision),
    buildSwMain.bind(null, settings.sw),
    minifyHtml.bind(null, settings.html)
  );
}

const prodSettings = createSettings();
const devSettings = createSettings(false);
export const build = await createBuild(prodSettings);
export const devBuild = await createBuild(devSettings);