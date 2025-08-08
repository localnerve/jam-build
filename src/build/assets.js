/**
 * Generate and write out site assets.
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
import { promises as fs, createWriteStream } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { SitemapStream, streamToPromise } from 'sitemap';
import Handlebars from 'handlebars';
import { loadSiteData } from './data.js';

/**
 * Generate and write the robots.txt.
 * Exclusions, and simple reference to the sitemap.
 *
 * @param {Object} siteData - global site-data.json.
 * @param {Object} settings - build settings.
 * @param {String} settings.dist - The path to the dist directory.
 * @param {String} settings.sitemapWebPath - The path to the sitemap.
 * @param {String} settings.sitemapName - The name (and extension) of the sitemap file.
 * @returns {Promise} resolves to undefined on completion.
 */
async function robots (siteData, settings) {
  const { dist, sitemapName, sitemapWebPath } = settings;

  const sitemapWeb =
    `${
      sitemapWebPath.endsWith('/') ? sitemapWebPath : `${sitemapWebPath}/`
    }${
      sitemapName
    }`;
  const sitemapWebUrl = new URL(sitemapWeb, `https://${siteData.appHost}`);

  await fs.writeFile(`${dist}/robots.txt`, `
    User-agent: *
    Disallow:
    sitemap: ${sitemapWebUrl}
    User-agent: ia_archiver
    Disallow: /`,
  'utf8');
}

/**
 * Generate and write the sitemap.xml.
 * Render sitemap settings from site-data.json for each page.
 * Pages that define sitemap settings go into the sitemap.
 * 
 * @param {Object} siteData - global site-data.json.
 * @param {Object} settings - build settings.
 * @param {String} settings.dist - The path to the dist directory.
 * @param {String} settings.sitemapWebPath - The path to the sitemap.
 * @param {String} settings.sitemapName - The name (and extension) of the sitemap file.
 * @returns {Promise} resolves to undefined on completion.
 */
async function sitemap (siteData, settings) {
  const { dist, sitemapName, sitemapWebPath } = settings;
  const sitemapFile = path.join(dist, sitemapWebPath, sitemapName);

  const smStream = new SitemapStream({
    hostname: `https://${siteData.appHost}`
  });

  const sitemapLinks = [];
  for (const page of Object.values(siteData.pages)) {
    if (page.sitemap) {
      sitemapLinks.push({
        url: page.route,
        ...page.sitemap
      });
    }
  }

  smStream.pipe(createWriteStream(sitemapFile));
  return streamToPromise(Readable.from(sitemapLinks).pipe(smStream));
}

/**
 * Read the assetsDir for asset templates, compile and render them against siteData, then write the result to dist.
 *
 * @param {Object} siteData - global site-data.json.
 * @param {Object} settings - build settings.
 * @param {String} settings.assetsDir - The directory of the assets templates.
 */
async function assetTemplates (siteData, settings) {
  const { dist, assetsDir } = settings;
  const assetTemplateDirents = await fs.readdir(assetsDir, {
    recursive: true,
    withFileTypes: true
  });
  
  for (const dirent of assetTemplateDirents) {
    if (!dirent.isFile() || path.parse(dirent.name).ext !== '.hbs') continue;

    const relDir = dirent.parentPath.replace(assetsDir, '');
    const templateName = dirent.name;
    const outputName = path.parse(dirent.name).name;

    const template = await fs.readFile(
      path.join(assetsDir, relDir, templateName), { encoding: 'utf8' }
    );
    const runnableTemplate = Handlebars.compile(template);
    const content = runnableTemplate(siteData);

    await fs.mkdir(path.join(dist, relDir), { recursive: true });
    await fs.writeFile(path.join(dist, relDir, outputName), content);
  }
}

/**
 * Generate and write the site general assets.
 * 
 * @param {Object} settings - build settings.
 * @param {Object} settings.dataDir - The path to the dataDir.
 * @returns 
 */
export async function generateAssets (settings) {
  const { dataDir } = settings;
  const siteData = await loadSiteData(dataDir);

  await robots(siteData, settings);
  await sitemap(siteData, settings);
  await assetTemplates(siteData, settings);
}