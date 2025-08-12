/**
 * Build the service worker.
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
import path from 'node:path';
import { glob } from 'glob';
import { generateSW } from 'workbox-build';
import { loadSiteData } from './data.js';
import { createScripts } from './scripts.js';
import pkg from '../../package.json' with { type: 'json' };

/**
 * Generate the version - build timestamp string.
 *
 * @returns {String} The version and build time as a string
 */
function getVersionBuildstamp () {
  return `${pkg.version}-${(new Date()).toISOString()}`;
}

/**
 * Generate the sw.custom.js runtime distribution.
 * 
 * @param {Object} settings - Build settings.
 * @param {*} replacements - Bundle replacments.
 * @return {Promise} Resolves to basename of reved, generated asset in dist for use in script imports.
 */
async function generateSWCustom (settings, replacements) {
  const {
    prod,
    dist,
    swCustomFilenameGlob,
    swCustomFileSrc,
    jsManifestFilename
  } = settings;

  const swCustomName = path.parse(swCustomFileSrc).name;

  await createScripts({
    jsManifestFilename,
    prod,
    replacements,
    rollupInput: {
      input: {
        [swCustomName]: swCustomFileSrc
      }  
    },
    rollupOutput: {
      dir: dist,
      format: 'umd',
      hashCharacters: 'hex',
      entryFileNames: () => {
        const parts = swCustomName.split('.');
        let pattern = `${parts[0]}-[hash:10]`;
        for (let i = 1; i < parts.length; i++) {
          pattern += `.${parts[i]}`;
        }
        return `${pattern}.js`;
      }
    }
  });

  // 4. resolve to public, reved /sw-a9reved9fa.custom.js filepath for importScripts
  const matches = await glob(`${dist}/${swCustomFilenameGlob}`);
  if (matches.length !== 1) {
    throw new Error('Failed to find sw.custom.js final file in dist');
  }
  return matches[0].replace(dist, '');
}

/**
 * Generate the sw.main.js file and dependencies.
 * 
 * @param {Object} settings - swSettings object.
 * @param {String} settings.dataDir - The site-data directory.
 */
export async function buildSwMain (settings) {
  const siteData = await loadSiteData(settings.dataDir);

  const cachePrefix = `${siteData.appHost}-${pkg.version}`;
  const { swMainGenerated, dist, prod } = settings;

  const ssrCacheable = Object.values(siteData.pages)
    .filter(page => page.type === 'nav')
    .map(page => page.route);

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

  const publicSwCustomPath = await generateSWCustom(settings, {
    SSR_CACHEABLE_ROUTES: JSON.stringify(ssrCacheable),
    CACHE_PREFIX: JSON.stringify(cachePrefix),
    VERSION_BUILDSTAMP: JSON.stringify(getVersionBuildstamp())
  });
  
  return generateSW({
    swDest: swMainGenerated,
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
