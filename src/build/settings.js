/**
 * Build configuration.
 * 
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */

const srcClient = 'src/application/client';
const dataDir = 'data';
const dist = 'dist';
const distImages = 'dist/images';
const webImages = '/images';
const distFonts = 'dist/fonts';
const webFonts = '/fonts';
const swMainGenerated = `${dist}/sw.main.js`;
const swCustomFilenameGlob = 'sw-*.custom.js';

/**
 * Create the build settings.
 *
 * @param {Boolean} prod - True if production, false otherwise.
 */
export function createSettings (prod = true) {
  return {
    prod,
    dist,
    distImages: `${dist}/images`,
    styles: {
      dist,
      srcClient,
      prod,
      distImages,
      webImages,
      distFonts,
      webFonts
    },
    images: {
      prod,
      distImages,
      responsiveConfig: {}
    },
    scripts: {
      dist,
      prod,
      rollupInput: {
        input: [
          `${srcClient}/scripts/main/index.js`,
          `${srcClient}/scripts/sw/sw.reg.js`
        ]
      },
      rollupOutput: {
        dir: dist,
        entryFileNames: '[name].js'
      }
    },
    templates: {
      srcData: dataDir,
      srcPage: `${dataDir}/page-partials`,
      srcContent: `${dataDir}/content-partials`,
      destDir: dist,
      styleOptions: {
        dir: `${srcClient}/styles/inline`,
        prod
      },
      scriptOptions: {
        prod,
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
      swCustomFileSrc: `${srcClient}/scripts/sw/sw.custom.js`,
      dist,
      prod
    },
    html: {
      prod,
      dataDir,
      dist
    },
    revision: {
      dist,
      prod
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
