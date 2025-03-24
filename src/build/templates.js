/**
 * Build the html templates and write them to the output directory.
 * 
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import Handlebars from 'handlebars';
import { default as hbHelpers } from './hb-helpers.js';
import { compileStyles } from './styles.js';
import { compileScripts } from './scripts.js';
import { loadSiteData } from './data.js';

/**
 * Load the inline css files.
 * inline css is matched to siteData.page.name by inline css filename.
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
 * Load the page partials.
 * 
 * @param {String} inputDir - The directory with the all the template files.
 * @returns {Object} The page fragments object hash by { page: content }
 */
async function loadPagePartials (inputDir) {
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
 * Load the content partials into an output object.
 * 
 * @param {String} inputDir - The content template directory.
 * @return {Object} The names of the partials by page.content-name and the partials themselves.
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
 * @param {Object} siteData - The site data.
 * @param {Object} pagePartials - The page templates object hash by { partial-name: content }
 * @param {Object} contentPartials - The contentn templates object hash by { partial-name: content }}
 * @param {Object} inlineCssPartials - The inline css object hash by { partial-name: content }
 * @param {Object} scriptPartials - The inline script object hash by { partial-name: content }
 */
function setupHandlebars (
  hbRef, siteData, pagePartials, contentPartials, inlineCssPartials, scriptPartials
) {
  const partials = {
    ...pagePartials, ...contentPartials, ...inlineCssPartials, ...scriptPartials
  };

  hbRef.registerPartial(partials);

  hbRef.registerHelper({
    ...hbHelpers,
    ...{
      svgPage: hbHelpers.svgPage.bind(null, hbRef),
      imageUrl: hbHelpers.fileUrl.bind(null, siteData.images.webImages),
      styleUrl: hbHelpers.fileUrl.bind(null, siteData.styles.webStyles),
      scriptUrl: hbHelpers.fileUrl.bind(null, siteData.scripts.webScripts)
    }
  });
}

/**
 * Template function wrapper to decorate the data prior to rendering.
 *
 * @param {CompiledTemplate} template - The compiled handlebars template.
 * @param {Object} data - The data to render the template with.
 * @returns 
 */
async function wrapTemplate (template, data) {
  const noIndex = [
    'four04', 'four03', 'five00', 'five03'
  ];
  const noNav = [
    'five03'
  ];

  data.active = data.page;
  data.noIndex = noIndex.indexOf(data.page) > -1;
  data.noNav = noNav.indexOf(data.page) > -1;
  data.htmlClasses = data.noNav ? ['no-nav'] : [];

  return template(data);
}

/**
 * Create the handlebars templates and compile them.
 * 
 * @param {String} srcData - The source directory for the content.
 * @param {String} srcPage - The source directory for the page templates.
 * @param {String} srcContent - The source directory for the page content templates.
 * @param {Object} styleOptions - The options to compile the inline css.
 * @param {Object} scriptOptions - The options to compile the inline scripts.
 * @returns 
 */
async function createTemplates (
  srcData, srcPage, srcContent, styleOptions, scriptOptions
) {
  const siteData = await loadSiteData(srcData);
  const pagePartials = await loadPagePartials(srcPage);
  const inlineCss = await loadInlineCss(styleOptions);
  const inlineScriptPartials = await loadInlineScripts(scriptOptions);
  const content = await loadContent(srcContent);

  const hb = Handlebars;
  setupHandlebars(
    hb,
    siteData,
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
        )
      ),
      // invariants
      inlineCss: inlineCss.names,
      content: content.names,
      siteData
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
    destDir, srcData, srcPage, srcContent, styleOptions, scriptOptions
  } = settings;

  const templates = await createTemplates(
    srcData, srcPage, srcContent, styleOptions, scriptOptions
  );

  return Promise.all(templates.map(async page => {
    const rendered = await page.template({
      page: page.name,
      siteData: page.siteData,
      inlineCss: page.inlineCss,
      content: page.content
    });

    return fs.writeFile(path.join(destDir, `${page.file}.html`), rendered);
  }));
}