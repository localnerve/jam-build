/**
 * Build the html templates and write them to the output directory.
 * 
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import Handlebars from 'handlebars';
import { default as hbHelpers, svgPage } from './hb-helpers.js';
import { compileStyles } from './styles.js';
import { compileScripts } from './scripts.js';
import { loadSiteData } from './data.js';

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
 * load the content directory into an output object.
 * 
 * @param {String} inputDir - The content template directory.
 */
async function loadContent (inputDir) {
  const entries = await fs.readdir(inputDir, {
    recursive: true,
    withFileTypes: true
  });

  const names = {};
  const partials = {};

  for (const entry of entries) {
    if (entry.isFile()) {
      const basename = path.basename(entry.parentPath);
      const partialName = `${basename}-${path.parse(entry.name).name}`;
      const contentName = `${path.parse(entry.name).name}`;
      const partialContent = await fs.readFile(
        path.join(entry.parentPath, entry.name), {
          encoding: 'utf8'
        }
      );
      
      if (!names[basename]) {
        names[basename] = {};
      }
      names[basename][contentName] = partialName;
      partials[partialName] = partialContent;
    }
  }

  return {
    names,
    partials
  };
}

/**
 * Setup handlebars for template rendering.
 *
 * @param {Handlebars} hbRef - A reference to handlebars.
 * @param {Object} pagePartials - The page templates object hash by { partial-name: content }
 * @param {Object} contentPartials - The contentn templates object hash by { partial-name: content }}
 * @param {Object} inlineCssPartials - The inline css object hash by { partial-name: content }
 * @param {Object} scriptPartials - The inline script object hash by { partial-name: content }
 */
function setupHandlebars (
  hbRef, pagePartials, contentPartials, inlineCssPartials, scriptPartials
) {
  const partials = {
    ...pagePartials, ...contentPartials, ...inlineCssPartials, ...scriptPartials
  };

  hbRef.registerPartial(partials);

  hbRef.registerHelper({
    ...hbHelpers,
    ...{
      svgPage: svgPage.bind(null, hbRef)
    }
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
  const noIndex = [
    'four04', 'four03', 'five00', 'five03'
  ];
  const noNav = [
    'five03'
  ];

  data.siteData = siteData;
  data.active = data.page;
  data.noIndex = noIndex.indexOf(data.page) > -1;
  data.noNav = noNav.indexOf(data.page) > -1;
  data.htmlClasses = data.noNav ? ['no-nav'] : [];

  return template(data);
}

/**
 * Create the handlebars templates and compile them.
 * 
 * @param {String} srcDir - The source directory for the content.
 * @param {String} srcTemplates - The source directory for the page templates.
 * @param {String} srcContent - The source directory for the page content templates.
 * @param {Object} cssOptions - The options to compile the inline css.
 * @param {Object} scriptOptions - The options to compile the inline scripts.
 * @returns 
 */
async function createTemplates (
  srcDir, srcTemplates, srcContent, cssOptions, scriptOptions
) {
  const siteData = await loadSiteData(srcDir);
  const pagePartials = await loadPageFragments(srcTemplates);
  const inlineCss = await loadInlineCss(cssOptions);
  const inlineScriptPartials = await loadInlineScripts(scriptOptions);
  const content = await loadContent(srcContent);

  siteData.inlineCss = inlineCss.names;
  siteData.content = content.names;

  const hb = Handlebars;
  setupHandlebars(
    hb,
    pagePartials,
    content.partials,
    inlineCss.partials,
    inlineScriptPartials
  );

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
    destDir, srcDir, srcTemplates, srcContent, cssOptions, scriptOptions
  } = settings;

  const templates = await createTemplates(
    srcDir, srcTemplates, srcContent, cssOptions, scriptOptions
  );

  return Promise.all(templates.map(async page => {
    const rendered = await page.template({
      page: page.name
    });

    return fs.writeFile(path.join(destDir, `${page.file}.html`), rendered);
  }));
}