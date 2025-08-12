/**
 * Bundle the main scripts.
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
 *   by including the string: "Copyright (c) 2025 Alex Grant <info@localnerve.com> (https://www.localnerve.com), LocalNerve LLC"
 *   in this material, copies, or source code of derived works.
 */
import { rollup } from 'rollup';
import resolve from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';
import replace from '@rollup/plugin-replace';
import dynamicImportVariables from '@rollup/plugin-dynamic-import-vars';
import pluginOutputManifest from 'rollup-plugin-output-manifest';
import { loadSiteData } from './data.js';
import pkg from '../../package.json' with { type: 'json' };

// gross
const { default: outputManifest } = pluginOutputManifest;

/**
 * Bundle and write javascript to the dist directory.
 * 
 * @param {Object} settings - build settings.
 * @param {Boolean} settings.prod - True for production, false otherwise.
 * @param {Object} settings.rollupInput - rollup input object.
 * @param {Object} settings.rollupOutput - rollup output object.
 * @param {String} settings.jsManifestFilename - Filename for the generated manifest file.
 * @param {String} [settings.dataDir] - The directory of site-data.
 * @param {String} [settings.webScripts] - The path to the root of scripts on the web. If supplied, creates the data.scripts namespace.
 * @param {Object} [settings.replacements] - additional replacements.
 */
export async function createScripts (settings) {
  const {
    rollupInput, rollupOutput, prod, jsManifestFilename,
    replacements = {}, dataDir, webScripts
  } = settings;
  const appVersion = pkg.version;
  
  if (dataDir && webScripts) {
    const data = await loadSiteData(dataDir);
    data.scripts = { webScripts: webScripts.replace(/\/$/, '') };
  }
  
  rollupInput.plugins = [
    dynamicImportVariables({
      errorWhenNoFilesFound: true
    }),
    outputManifest({
      fileName: jsManifestFilename,
      isMerge: true
    }),
    resolve({
      paths: [
        './node_modules'
      ]
    }),
    replace({
      'process.env.NODE_ENV': prod ? 
        JSON.stringify('production') : JSON.stringify('development'),
      preventAssignment: true,
      APP_VERSION: JSON.stringify(appVersion),
      ...replacements
    })
  ];

  if (prod) {
    rollupInput.plugins.push(terser());
  }

  const bundle = await rollup(rollupInput);
  return bundle.write(rollupOutput);
}

/**
 * Compile scripts in memory.
 * 
 * @param {Object} options - rollup options.
 * @param {Boolean} prod - True for production, false otherwise.
 * @param {Object} [replacements] - Key value hash of any replacements to look for.
 * @param {Object} options.inputOptions - rollup input options.
 * @param {Object} options.outputOptions - rollup output options.
 * @returns {Array} Array of rollup compiled output objects. 
 */
export async function compileScripts (options) {
  const { prod, replacements = false } = options;
  const plugins = [];

  if (prod) {
    plugins.push(terser());
  }

  if (replacements) {
    plugins.push(replace({
      preventAssignment: true,
      ...replacements
    }));
  }

  if (options.inputOptions.plugins) {
    options.inputOptions.plugins.push(...plugins);
  } else {
    options.inputOptions.plugins = plugins;
  }

  const bundle = await rollup(options.inputOptions);
  const output = await bundle.generate(options.outputOptions);
  return output;
}