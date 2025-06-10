/**
 * Bundle the main scripts.
 * 
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */
import fs from 'node:fs/promises';
import { rollup } from 'rollup';
import resolve from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';
import replace from '@rollup/plugin-replace';
import alias from '@rollup/plugin-alias';
import dynamicImportVariables from '@rollup/plugin-dynamic-import-vars';
import pluginOutputManifest from 'rollup-plugin-output-manifest';
import nodePolyfills from 'rollup-plugin-polyfill-node';
import { visualizer } from 'rollup-plugin-visualizer';
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
 * @param {String} [settings.name] - A name to use to identify this bundle run, used for visualizer output.
 * @param {String} [settings.webScripts] - The path to the root of scripts on the web. If supplied, creates the data.scripts namespace.
 * @param {Object} [settings.replacements] - additional replacements.
 * @param {Array<string | RegExp>} [settings.nodeIncludes] - files to match for node includes. if undefined, node plugin omitted.
 */
export async function createScripts (settings) {
  const {
    rollupInput, rollupOutput, prod, jsManifestFilename, name,
    replacements = {}, dataDir, webScripts, nodeIncludes
  } = settings;
  const appVersion = pkg.version;
  
  if (dataDir && webScripts) {
    const data = await loadSiteData(dataDir);
    data.scripts = { webScripts: webScripts.replace(/\/$/, '') };
  }
  
  const rollupInputPlugins = [
    dynamicImportVariables({
      errorWhenNoFilesFound: true
    }),
    outputManifest({
      fileName: jsManifestFilename,
      isMerge: true
    }),
    resolve({
      browser: true,
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

  if (rollupInput.plugins) {
    rollupInput.plugins.unshift(...rollupInputPlugins);
  } else {
    rollupInput.plugins = rollupInputPlugins;
  }

  if (nodeIncludes) {
    rollupInput.plugins.push(alias({
      entries: [{find: /^node:(.*)/, replacement: '$1'}],
    }));
    rollupInput.plugins.push(nodePolyfills({
      include: nodeIncludes
    }));
  }

  if (prod) {
    rollupInput.plugins.push(terser());
  }

  // ensure 'stats' dir
  const statsDir = 'stats';
  await fs.mkdir(statsDir, { recursive: true });

  // Must be last plugin
  rollupInput.plugins.push(visualizer({
    filename: `${statsDir}/${name}.html`,
    gzipSize: true
  }));

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