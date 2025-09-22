/**
 * Coverage utilities.
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
 *    by including the string: "Copyright (c) 2025 Alex Grant <info@localnerve.com> (https://www.localnerve.com), LocalNerve LLC"
 *    in this material, copies, or source code of derived works.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import libCoverage from 'istanbul-lib-coverage';
import libReport from 'istanbul-lib-report';
import v8toIstanbul from 'v8-to-istanbul';
import reports from 'istanbul-reports';

export function createMap () {
  return libCoverage.createCoverageMap();
}

export async function createReport (map, testInfo) {
  const coverageDir = path.join(testInfo.project.outputDir, 'coverage');
  await fs.mkdir(coverageDir, { recursive: true });

  let i = 0, exists = true;
  const basename = `coverage`;
  // title is the describe suite name in the file [1]
  const title = testInfo.titlePath[1].replaceAll(/\s+/g, '-');
  let outputPath = `${coverageDir}/${basename}-${title}-${i}`;

  while (exists) {
    try {
      exists = await fs.access(outputPath).then(() => true);
      outputPath = path.join(coverageDir, `${basename}-${title}-${++i}`);
    } catch {
      exists = false;
    }
  }

  reports.create('lcov').execute(libReport.createContext({
    dir: outputPath,
    coverageMap: map
  }));
}

export async function startJS (browserName, page) {
  if (browserName !== 'chromium') return;

  await page.coverage.startJSCoverage({
    resetOnNavigation: false
  });
}

export async function stopJS (browserName, page, map) {
  if (browserName !== 'chromium') return;

  const coverage = await page.coverage.stopJSCoverage();

  for (const entry of coverage) {
    const url = new URL(entry.url);
    if (url.origin === process.env.BASE_URL) {
      const urlPart = url.pathname;
      const pathName = urlPart.endsWith('/') ? '/home' : urlPart;
      const scriptPath = `dist${!path.extname(pathName) ? `${pathName}.html` : pathName}`;
      const converter = v8toIstanbul(scriptPath, 0, { source: entry.source });
      await converter.load();
      converter.applyCoverage(entry.functions);
      const newMap = libCoverage.createCoverageMap(converter.toIstanbul());
      map.merge(newMap);
    }
  }

  if (page.url().startsWith(process.env.BASE_URL)) {
    let swCoverage = await getSwCoverage(page);
    if (!process.env.LOCALHOST_PORT) {
      // Not local, so remap swCoverage baseDir by removing /home/node/app from testcontainer home
      const remoteRoot = '/home/node/app';
      const localRoot = '.';
      const remappedData = {};
      Object.keys(swCoverage).forEach(key => {
        const newKey = key.replace(remoteRoot, localRoot);
        remappedData[newKey] = { ...swCoverage[key], ...{
          path: swCoverage[key].path.replace(remoteRoot, localRoot)
        }};
      });
      swCoverage = remappedData;
    }
    const newSwMap = libCoverage.createCoverageMap(swCoverage);
    map.merge(newSwMap);
  }
}

async function getSwCoverage (page) {
  await page.addScriptTag({
    content: 'async function __send_message_to_sw (msg) { \
      const registration = await navigator.serviceWorker.ready; \
      \
      return new Promise((resolve, reject) => { \
        const msg_chan = new MessageChannel(); \
        \
        msg_chan.port1.onmessage = event => { \
          if (event.data.error) { \
            reject(event.data.error); \
          } else { \
            resolve(event.data); \
          } \
        }; \
        \
        registration.active.postMessage(msg, [msg_chan.port2]); \
      }); \
    };'
  });

  const coverage = await page.evaluate(async () => {
    const { action, result } = await __send_message_to_sw({ action: '__coverage__' });
    if (action === '__coverage__') return result;
    throw new Error('Got unexpected message, needed __coverage__');
  });

  return coverage;
}