/**
 * Build the service worker.
 * 
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import hb from 'handlebars';
import { glob } from 'glob';
import { generateSW } from 'workbox-build';
import { loadSiteData } from './data.js';
import { createScripts } from './scripts.js';
import { customTemplate } from './sw.custom.template.js';
import pkg from '../../package.json' with { type: 'json' }

/**
 * Generate the version - build timestamp string.
 *
 * @returns {String} The version and build time as a string
 */
function getVersionBuildstamp () {
  return `${pkg.version}-${(new Date()).toISOString()}`;
}

/**
 * Generate sw custom file from template.
 *
 * @param {Object} templateData - data for the sw.custom template.
 * @param {Object} settings - sw settings config object.
 * @param {String} settings.swCustomTemplateFilename - The sw custom template filename.
 * @return {Promise} Resolves to basename of reved, generated asset in dist.
 */
function generateSWCustom (templateData, settings) {
  const {
    prod,
    dist,
    swCustomFilenameGlob,
    swCustomTmp,
    swCustomFilename
  } = settings;
  
  const tmpPrefix = `${os.tmpdir()}${path.sep}`;
  const tmpBase = `${path.parse(fs.mkdtempSync(tmpPrefix)).name}.js`;
  const tmpPath = `${fs.mkdtempSync(tmpPrefix)}${path.sep}${tmpBase}`;

  // 1. Process the template file
  return (new Promise((resolve) => {
    resolve(hb.compile(customTemplate)(templateData));
  // 2. write the raw, unbundled code to a buildable tmp source
  })).then(swCustomCode => {
    return new Promise((resolve, reject) => {
      fs.writeFile(tmpPath, swCustomCode, err => {
        if (err) {
          return reject(new Error(`Failed to write swCustom code: ${err}`));
        }

        const swCustomTmpSource = `./${swCustomTmp}/${swCustomFilename}`;
        const newTmp = path.resolve(swCustomTmpSource);
        fs.mkdirSync(path.parse(newTmp).dir, {
          recursive: true
        });

        // bring local so deps can resolve during bundling
        fs.copyFile(tmpPath, newTmp, err => {
          if (err) {
            return reject(new Error(`Failed to write swCustom tmp: ${err}`));
          }
          resolve(swCustomTmpSource);
        });
      });
    });
  // 3. bundle the code to dist
  }).then(swCustomTmpSource => {
    const name = path.parse(swCustomTmpSource).name;
    return createScripts({
      prod,
      rollupInput: {
        input: {
          [name]: swCustomTmpSource
        }  
      },
      rollupOutput: {
        dir: dist,
        format: 'umd',
        hashCharacters: 'hex',
        entryFileNames: () => {
          const parts = name.split('.');
          let pattern = `${parts[0]}-[hash:10]`;
          for (let i = 1; i < parts.length; i++) {
            pattern += `.${parts[i]}`;
          }
          return `${pattern}.js`;
        }
      }
    });
  // 4. resolve to public, reved /sw-a9reved9fa.custom.js filepath for importScripts
  }).then(() => {
    return glob(`${dist}/${swCustomFilenameGlob}`)
      .then(matches => {
        if (matches.length !== 1) {
          throw new Error('Failed to find swCustom final file');
        }
        return matches[0].replace(dist, '');
      })
      .catch(() => {
        throw new Error('Failed to find swCustom final file');
      });
  });
}

/**
 * Generate the sw.main.js file and dependencies.
 * 
 * @param {Object} settings - swSettings object.
 */
export async function buildSwMain (settings) {
  const siteData = await loadSiteData(settings.dataDir);

  const cachePrefix = `${siteData.appHost}-${pkg.version}`;
  const { swMainGenerated, dist, prod } = settings;
  const swDest = `${swMainGenerated}`;

  const ssrCacheable = Object.values(siteData.pages)
    .filter(page => page.type === 'nav')
    .map(page => page.route);

  const ssrCacheableRoutes = ssrCacheable.map(route => `'${route}'`).join(',');

  const ssrConfig = {
    urlPattern: new RegExp(`${ssrCacheable.reduce((acc, cur) => {
      const current = cur.slice(1);
      return current ? `${acc}|${current}` : acc;
    }, '\\/(?:')})\\/?(?:\\?.+)?$`),
    handler: 'StaleWhileRevalidate',
    options: {
      cacheableResponse: {
        statuses: [200]
      },
      fetchOptions: {
        mode: 'same-origin'
      },
      matchOptions: {
        ignoreSearch: true
      },
      broadcastUpdate: {
        channelName: 'RUNTIME-PAGE-UPDATE',
        options: {
          headersToCheck: ['etag']
        }
      }
    }
  };

  const gstaticConfig = {
    urlPattern: /.*(?:gstatic)\.com/,
    handler: 'CacheFirst',
    options: {
      cacheName: `${cachePrefix}-gstatic`
    }
  };

  const versionBuildstamp = getVersionBuildstamp();

  const publicSwCustomPath = await generateSWCustom({ 
      ssrCacheableRoutes,
      cachePrefix,
      versionBuildstamp
    }, settings);
  
  return generateSW({
    swDest,
    skipWaiting: false,
    clientsClaim: true,
    mode: prod ? 'production' : 'development',
    sourcemap: prod ? false : true,
    cacheId: cachePrefix,
    offlineGoogleAnalytics: true,
    cleanupOutdatedCaches: true,
    inlineWorkboxRuntime: true,
    importScripts: [publicSwCustomPath],
    globDirectory: dist,
    globPatterns: [
      '**/*.{js,css,svg,png,jpg,jpeg,webmanifest,xml}', // len 2..11
      '{privacy,terms}.html'
    ],
    globIgnores: [
      'sitemap.xml', 'sw*.js', 'images/ogimage*'
    ],
    dontCacheBustURLsMatching: /.+-[a-f0-9]{10}(?:\.min)?\..{2,11}$/,
    runtimeCaching: [
      ssrConfig, gstaticConfig
    ]
  });
}

export default {
  buildSwMain
};
