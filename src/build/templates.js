/**
 * Build the html templates and write them to the output directory.
 * 
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import Handlebars from "handlebars";
import { compileStyles } from './styles.js';
import { compileScripts } from './scripts.js';
import { loadSiteData } from './data.js';

const thisDirname = url.fileURLToPath(new URL('.', import.meta.url));

/**
 * Load the inline css files.
 *
 * @param {Object} options - The cssOptions.
 * @param {String} options.dir - The directory with all the inline css files.
 * @param {Boolean} options.prod - True if production, false otherwise.
 * @param {Array} options.loadPaths - Array of paths to inline css includes.
 * @returns {Object} An object containing a hash for the partials and a hash for the page name to partial name lookup.
 */
async function loadInlineCss (options) {
  const files = await fs.readdir(options.dir);

  const inlineCss = await Promise.all(files.map(
    async file => {
      const text = await fs.readFile(path.join(options.dir, file), {
        encoding: 'utf8'
      });
      const content = compileStyles(text, options);
      return {
        name: path.parse(file).name,
        content
      };
    }
  ));

  return {
    partials: inlineCss.reduce((acc, curr) => {
      acc[`inlineCss-${curr.name}`] = curr.content;
      return acc;
    }, {}),
    names: inlineCss.reduce((acc, curr) => {
      acc[curr.name] = `inlineCss-${curr.name}`;
      return acc;
    }, {})
  };
}

/**
 * Load the inline script files.
 * 
 * @param {Object} options - the scriptOptions.
 * @returns {Array} Array of compile results.
 */
async function loadInlineScripts (options) {
  const { output } = await compileScripts(options);

  const partials = {};
  for (const asset of output) {
    partials[`${asset.name}Js-all`] = asset.code;
  }

  return partials;
}

/**
 * Load the page fragments.
 * 
 * @param {String} inputDir - The directory with the all the template files.
 * @returns {Object} The page fragments object hash by { page: content }
 */
async function loadPageFragments (inputDir) {
  const files = await fs.readdir(inputDir);

  const fragments = await Promise.all(files.map(
    async file => {
      const content = await fs.readFile(path.join(inputDir, file), {
        encoding: 'utf8'
      });

      return {
        name: path.parse(file).name,
        content
      };
    }
  ));

  return fragments.reduce((acc, curr) => {
    acc[curr.name] = curr.content;
    return acc;
  }, {});
}

/**
 * Lift words from a sentence.
 * 
 * @param {String} sentence - The input sentence.
 * @param {Number} start - The start index.
 * @param {Number} end - The end index (word not included).
 * @returns {String} The sliced words in a string.
 */
export function subWords (sentence, start, end) {
  const words = sentence.match(/\b[^\s]+\b/g);
  if (words) {
    return words.slice(start, end).join(' ');
  }
  return '';
}

/**
 * Slice a given word string.
 * 
 * @param {String} word - The input word.
 * @param {Number} start - The start index.
 * @param {Number} end - The end index (end char not included).
 * @returns {String} The sliced chars as a new string.
 */
export function subChars (word, start, end) {
  return word.slice(start, end);
}

/**
 * Just for dumping template context
 *
 * @param {Array} targets - references to some objects you want to inspect
 */
/* eslint-disable no-console */
export function debug (...targets) {
  console.log('@@@ -- Current Context -- @@@');
  console.log(this);
  if (targets && targets.length > 0) {
    console.log('@@@ -- Targets -- @@@');
    targets.forEach((target, index) => {
      console.log(`Target ${index}:\n`, target);
    });
  }
  console.log('@@@ --------------------- @@@');
}
/* eslint-enable no-console */

/**
 * Helper to test strict equality.
 *
 * @param {*} value1 
 * @param {*} value2 
 * @returns true if strict equal, false otherwise.
 */
function equals (value1, value2) {
  return value1 === value2;
}

/**
 * Setup handlebars for template rendering.
 *
 * @param {Handlebars} hbRef - A reference to handlebars.
 * @param {Object} pageFragments - The page fragments object hash by { page: content }
 * @param {Object} inlineCss - The inline css object hash by { partial-name: content }
 * @param {Object} scriptPartials - The inline script object hash by { partial-name: content }
 */
function setupHandlebars (hbRef, pageFragments, inlineCss, scriptPartials) {
  const partials = {
    ...pageFragments, ...inlineCss, ...scriptPartials
  };

  hbRef.registerPartial(partials);

  hbRef.registerHelper({
    equals,
    subChars,
    subWords,
    debug
  });
}

/**
 * Template function wrapper to decorate the data prior to rendering.
 *
 * @param {CompiledTemplate} template - The compiled handlebars template.
 * @param {Object} siteData - The site data.
 * @param {Object} data - The data to render the template with.
 * @returns 
 */
async function wrapTemplate (template, siteData, data) {
  data.siteData = siteData;
  data.active = data.page;
  return template(data);
}

/**
 * Create the handlebars templates and compile them.
 * 
 * @param {String} srcDir - The source directory for the content.
 * @param {String} srcTemplates - The source directory for the templates.
 * @param {Object} cssOptions - The options to compile the inline css.
 * @param {Object} scriptOptions - The options to compile the inline scripts.
 * @returns 
 */
async function createTemplates (srcDir, srcTemplates, cssOptions, scriptOptions) {
  const siteData = await loadSiteData(srcDir);
  const pageFragments = await loadPageFragments(srcTemplates);
  const inlineCss = await loadInlineCss(cssOptions);
  const inlineScriptPartials = await loadInlineScripts(scriptOptions);

  siteData.inlineCss = inlineCss.names;

  const hb = Handlebars;
  setupHandlebars(hb, pageFragments, inlineCss.partials, inlineScriptPartials);

  const templates = [];
  for (const page of Object.values(siteData.pages)) {
    templates.push({
      name: page.name,
      file: page.file,
      template: wrapTemplate.bind(
        null,
        hb.compile(
          String.raw`{{> header }}{{> ${page.template} }}{{> footer}}`
        ),
        siteData
      )
    });
  }

  return templates;
}

/**
 * Render the html pages to the file system.
 * 
 * @param {Object} settings - The build settings.
 * @returns {Array} An array of promises that resolve to the written files.
 */
export async function renderHtml (settings) {
  const {
    destDir, srcDir, srcTemplates, cssOptions, scriptOptions
  } = settings;

  const templates = await createTemplates(
    srcDir, srcTemplates, cssOptions, scriptOptions
  );

  return Promise.all(templates.map(async page => {
    const content = await page.template({
      page: page.name
    });

    return fs.writeFile(path.join(destDir, `${page.file}.html`), content);
  }));
}