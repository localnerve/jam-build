/**
 * Bundle the main scripts.
 * 
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */
import { rollup } from 'rollup';
import resolve from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';
import replace from '@rollup/plugin-replace';
import pkg from '../../package.json' with { type: 'json' };

/**
 * Bundle and write javascript to the dist directory.
 * 
 * @param {Object} settings - build settings.
 * @param {Object} settings.rollupInput - rollup input object.
 * @param {Object} settings.rollupOutput - rollup output object.
 * @param {Object} [settings.replacements] - additional replacements.
 * @param {Boolean} settings.prod - True for production, false otherwise.
 */
export async function createScripts (settings) {
  const { rollupInput, rollupOutput, prod, replacements = {} } = settings;
  const appVersion = pkg.version;

  rollupInput.plugins = [
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
 * @param {Object} options.input - rollup input options.
 * @param {Object} options.output - rollup output options.
 * @returns {Array} Array of rollup compiled output objects. 
 */
export async function compileScripts (options) {
  const { prod } = options;

  if (prod) {
    options.inputOptions.plugins = [terser()];
  }

  const bundle = await rollup(options.inputOptions);
  const output = await bundle.generate(options.outputOptions);
  return output;
}