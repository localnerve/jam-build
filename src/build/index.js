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
 * @param {Object} args - command line arguments.
 * @returns {Stream} A gulp series.
 */
async function createBuild (settings, args) {
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
    renderHtml.bind(null, settings.templates, args),
    pageRevision.bind(null, settings.revision),
    buildSwMain.bind(null, settings.sw),
    minifyHtml.bind(null, settings.html),
    async function audit () {
      if (args.dump) {
        const { loadSiteData } = await import('./data.js');
        const fs = await import('node:fs/promises');
        const data = await loadSiteData('data');
        await fs.mkdir('dump', { recursive: true });
        await fs.writeFile('dump/site-data.json', JSON.stringify(data, null, 2));
        await fs.writeFile('dump/build-settings.json', JSON.stringify(settings, null, 2));
      }
    }
  );
}

const prodSettings = createSettings();
const devSettings = createSettings(false);
export const build = createBuild.bind(null, prodSettings);
export const devBuild = createBuild.bind(null, devSettings);