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
}

