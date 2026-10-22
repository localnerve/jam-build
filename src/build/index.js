/**
 * The Build Sequence.
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

import fs from 'node:fs/promises';
import { series } from 'node-build-stream';

import { createSettings } from './settings.js';
import { getStyleSequence } from './styles.js';
import { createScripts } from './scripts.js';
import { dirCopy } from './copy.js';
import { generateAssets } from './assets.js';
import { renderHtml } from './templates.js';
import { minifyHtml } from './html.js';
import { buildSwMain } from './sw.js';
import { getImageSequence } from './images.js';
import { assetRevision, midLevelRevision, pageRevision } from './revision.js';
import { log } from './utils.js';

/**
 * Wrap a build stage so it announces its start and completion through log().
 * The wrapped body is invoked only when the surrounding series reaches this
 * slot, preserving the laziness of thunk/schedule items.
 *
 * @param {string} name - Human-readable label for progress output.
 * @param {Function} run - Zero-arg task body; may return a value, Promise, or NBS schedule.
 * @returns {Function} A zero-arg async task that logs, runs `run`, and rethrows on error.
 */
function stage (name, run) {
  return async function staged () {
    log('build', `→ ${name}`);
    try {
      const result = await run();
      log('build', `✓ ${name}`);
      return result;
    } catch (err) {
      log('build', `✗ ${name} failed`, 'error');
      throw err;
    }
  };
}

/**
 * Main website build.
 * 
 * @param {Object} settings - build parameters.
 * @param {Object} args - command line arguments.
 * @returns {Object} A node-build-stream series schedule (lazy; runs when awaited).
 */
function createBuild (settings, args) {
  async function prepare () {
    await fs.rm(settings.dist, { recursive: true, force: true });
    await fs.mkdir(settings.dist, { recursive: true });
    await fs.mkdir(settings.distImages, { recursive: true });
  }

  async function audit () {
    if (args.dump) {
      const { loadSiteData } = await import('./data.js');
      const { loadJsonLd } = await import('./jsonld.js');
      const data = await loadSiteData('data');
      const jsonld = await loadJsonLd('data', { strict: Boolean(args.strict) });
      await fs.mkdir('dump', { recursive: true });
      await fs.writeFile('dump/site-data.json', JSON.stringify(data, null, 2));
      await fs.writeFile('dump/build-settings.json', JSON.stringify(settings, null, 2));
      await fs.writeFile('dump/jsonld.json', JSON.stringify(jsonld, null, 2));
    }
  }

  return series(
    stage('prepare', prepare),
    stage('copy images', dirCopy.bind(null, settings.copyImages)),
    // Thunk items: the async sequence factories are invoked (and their
    // schedules started) only when series reaches this slot. Awaiting them
    // here would start both pipelines immediately — before prepare/dirCopy.
    stage('images', () => getImageSequence(settings.images)),
    stage('styles', () => getStyleSequence(settings.styles)),
    stage('scripts', createScripts.bind(null, settings.scripts)),
    stage('assets', generateAssets.bind(null, settings.assets)),
    stage('rev: assets', assetRevision.bind(null, settings.revision)),
    stage('rev: midlevel', midLevelRevision.bind(null, settings.revision)),
    stage('html templates', renderHtml.bind(null, settings.templates, args)),
    stage('rev: pages', pageRevision.bind(null, settings.revision)),
    stage('service worker', buildSwMain.bind(null, settings.sw)),
    stage('minify html', minifyHtml.bind(null, settings.html)),
    stage('audit', audit)
  );
}

const prodSettings = createSettings();
const devSettings = createSettings(false);
export const build = createBuild.bind(null, prodSettings);
export const devBuild = createBuild.bind(null, devSettings);