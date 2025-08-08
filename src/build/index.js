/**
 * The Build Sequence.
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