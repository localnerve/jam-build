/**
 * Coverage utilities.
 * 
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
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
  let outputPath = `${coverageDir}/${basename}-${i}`;

  while (exists) {
    try {
      exists = await fs.access(outputPath).then(() => true);
      outputPath = path.join(coverageDir, `${basename}-${++i}.json`);
    } catch {
      exists = false;
    }
  }

  reports.create('lcov').execute(libReport.createContext({
    dir: outputPath,
    coverageMap: map
  }));
}

export async function startJS (page) {
  await page.coverage.startJSCoverage({
    resetOnNavigation: false
  });
}

export async function stopJS (page, map) {
  const coverage = await page.coverage.stopJSCoverage();

  for (const entry of coverage) {
    const urlPart = (new URL(entry.url)).pathname;
    const pathName = urlPart.endsWith('/') ? '/home' : urlPart;
    const scriptPath = `dist${!path.extname(pathName) ? `${pathName}.html` : pathName}`;
    const converter = v8toIstanbul(scriptPath, 0, { source: entry.source });
    await converter.load();
    converter.applyCoverage(entry.functions);
    const newMap = libCoverage.createCoverageMap(converter.toIstanbul());
    map.merge(newMap);
  }

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