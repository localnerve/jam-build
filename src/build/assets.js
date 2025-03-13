/**
 * Generate dynamic site assets
 * 
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */
import { promises as fs, createWriteStream } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { SitemapStream, streamToPromise } from 'sitemap';
import { loadSiteData } from './data.js';

export async function generateAssets (settings) {
  const { dist, dataDir, sitemapName, sitemapWebPath } = settings;
  const sitemapFile = path.join(dist, sitemapName);
  const sitemapWeb =
    `${
      sitemapWebPath.endsWith('/') ? sitemapWebPath : `${sitemapWebPath}/`
    }${
      sitemapName
    }`;
  
  const siteData = await loadSiteData(dataDir);
  const smStream = new SitemapStream({
    hostname: `https://${siteData.appHost}`
  });
  const sitemapWebUrl = new URL(sitemapWeb, `https://${siteData.appHost}`);

  await fs.writeFile(`${dist}/robots.txt`, `
    User-agent: *
    Disallow:
    sitemap: ${sitemapWebUrl}
    User-agent: ia_archiver
    Disallow: /`,
    'utf8'
  );

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