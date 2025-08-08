/**
 * Build configuration.
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

const srcClient = 'src/application/client';
const dataDir = 'data';
const dist = 'dist';
const distImages = 'dist/images';
const distFonts = 'dist/fonts';
const webImages = '/images';
const webFonts = '/fonts';
const webStyles = '/styles';
const webScripts = '/';
const jsManifestFilename = 'rollup-manifest.json';
const swMainGenerated = `${dist}/sw.main.js`;
const swCustomFilenameGlob = 'sw-*.custom.js';
const apiVersion = '1.0.0';
const schemaVersion = '1';

/**
 * Create the build settings.
 *
 * @param {Boolean} prod - True if production, false otherwise.
 */
export function createSettings (prod = true) {
  return {
    prod,
    dist,
    distImages,
    styles: {
      dist,
      dataDir,
      srcClient,
      prod,
      distImages,
      webImages,
      distFonts,
      webFonts,
      webStyles
    },
    images: {
      prod,
      distImages,
      webImages,
      dataDir,
      responsiveConfig: {
        'hero-*.jpg': [{
          quality: 80,
          width: 670,
          progressive: true,
          rename: {
            suffix: '-670-size'
          }
        }, {
          quality: 80,
          width: 1024,
          progressive: true,
          rename: {
            suffix: '-1024-size'
          }
        }, {
          quality: 65,
          width: 1440,
          progressive: true,
          rename: {
            suffix: '-1440-size'
          }
        }, {
          quality: 65,
          width: 1920,
          progressive: true,
          rename: {
            suffix: '-1920-size'
          }
        }]
      }
    },
    scripts: {
      dist,
      dataDir,
      prod,
      name: 'main',
      webScripts,
      jsManifestFilename,
      replacements: {
        PAGE_MODULES: JSON.stringify(['home']).replaceAll('"', '\''),
        'process.env.AUTHZ_URL': JSON.stringify(process.env.AUTHZ_URL).replaceAll('"', '\''),
        'process.env.AUTHZ_CLIENT_ID': JSON.stringify(process.env.AUTHZ_CLIENT_ID).replaceAll('"', '\'')
      },
      rollupInput: {
        input: [
          `${srcClient}/scripts/main/index.js`,
          `${srcClient}/scripts/main/_admin.js`,
          `${srcClient}/scripts/main/pages/home.js`,
          `${srcClient}/scripts/sw/sw.reg.js`
        ]
      },
      rollupOutput: {
        dir: dist,
        hashCharacters: 'hex',
        entryFileNames: info => {
          if (prod) {
            const swParts = info.name.match(/^sw\.(?<rest>.+)/);
            if (swParts) {
              return `sw-[hash:10].${swParts.groups.rest}.js`;
            }
            return '[name]-[hash:10].js';
          }
          return '[name].js';
        }
      }
    },
    templates: {
      srcData: dataDir,
      srcPage: `${dataDir}/partials/page`,
      srcContent: `${dataDir}/partials/content`,
      destDir: dist,
      connectsrc: [
        process.env.AUTHZ_URL
      ],
      framesrc: [
        process.env.AUTHZ_URL
      ],
      styleOptions: {
        dir: `${srcClient}/styles/inline`,
        prod
      },
      scriptOptions: {
        prod,
        name: 'templates',
        replacements: {
          POLY_TEST_FN: 'function polyTest () {\
return !("fetch" in window && \
"Promise" in window && \
"from" in Array); }',
          POLY_TEST: 'polyTest',
          POLY_URL: JSON.stringify('https://polyfill-fastly.io/v3/polyfill.min.js?features=fetch,es6')
        },
        inputOptions: {
          input: {
            inline: `${srcClient}/scripts/inline/index.js`
          }
        },
        outputOptions: {
          format: 'iife'
        }
      }
    },
    sw: {
      dataDir,
      swMainGenerated,
      swCustomFilenameGlob,
      jsManifestFilename,
      swCustomFileSrc: `${srcClient}/scripts/sw/sw.custom.js`,
      dist,
      prod,
      apiVersion,
      schemaVersion
    },
    html: {
      prod,
      dataDir,
      dist
    },
    revision: {
      dist,
      prod,
      jsManifestFilename
    },
    copyImages: {
      srcDir: `${srcClient}/images`,
      destDir: `${dist}/images`
    },
    assets: {
      dist,
      dataDir,
      assetsDir: `${srcClient}/assets`,
      sitemapName: 'sitemap.xml',
      sitemapWebPath: '/'
    }
  };
}
