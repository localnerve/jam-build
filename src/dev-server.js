/**
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import compression from 'compression';

const port = process.argv.reduce((dflt, item) => {
  const groups = item.match(/--PORT=(?<port>\d+)/i)?.groups;
  return groups?.port || dflt;
}, 5000);

const rootDir = process.argv.reduce((dflt, item) => {
  const groups = item.match(/--ROOTDIR=(?<rootdir>[^\s]+)/i)?.groups;
  return groups?.rootdir || dflt;
}, './dist');

const useCompression = process.argv.some(item => item.match('COMPRESS'));

const debug = process.argv.some(item => item.match('DEBUG'));

const assetLogger = debug ? console.log : () => {};
const server = express();

if (useCompression) {
  server.use(compression());
}

// if no /path exists, try /path.html
server.use((req, res, next) => {
  const filePath = path.resolve(rootDir, '.'+req.path);
  fs.access(filePath, err => {
    if (err) {
      fs.access(filePath + '.html', err => {
        if (!err) {
          let path = req.path;
          if (path[path.length - 1] === '/') {
            path = path.slice(0, -1);
          }
          req.url = path + '.html';
        }
        assetLogger(req.url);
        next();
      });
    } else {
      assetLogger(req.url);
      next();
    }
  });
});

server.use(express.static(rootDir, {
  index: 'home.html'
}));

server.use((req, res) => {
  assetLogger('404', req.url);
  res.status(404).sendFile('404.html', { root: rootDir });
});

server.listen(port, err => {
  if (err) {
    return console.error(err);
  }
  return console.log(`serving ${rootDir}, listening on port ${port}`);
});
