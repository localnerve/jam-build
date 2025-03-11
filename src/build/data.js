/**
 * Load site-data.json and cache for re-use.
 * 
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';

let siteData = null;

/**
 * Load the site-data.json as an Object.
 *
 * @param {String} inputDir - The directory with all the content files.
 * @returns {Object} The site data object.
 */
export async function loadSiteData (inputDir) {
  if (siteData) {
    return siteData;
  }
  
  const jsonText = await fs.readFile(
    path.join(inputDir, 'site-data.json'),
    { encoding: 'utf8' }
  );
  siteData = JSON.parse(jsonText);
  return siteData;
}