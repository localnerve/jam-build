/**
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */
import gulp from 'gulp';

import {
  build,
  devBuild
} from './src/build/index.js';

/**
 * getTaskArguments parses command line arguments, --name value, to an object
 *   `gulp mytask --a 123 --b "my string" --c`
 *   produces:
 *     {
 *       "a": "123",
 *       "b": "my string",
 *       "c": true
 *     }
 * @param {String[]} argList - List of arguments, process.argv
 * @returns {Object} The command line arguments as an object
 */
function getTaskArguments (argList) {
  const arg = {};
  let a, opt, thisOpt, curOpt;
  for (a = 0; a < argList.length; a++) {
    thisOpt = argList[a].trim();
    opt = thisOpt.replace(/^-+/, '');

    if (opt === thisOpt) {
      // argument value
      if (curOpt) arg[curOpt] = opt;
      curOpt = null;
    }
    else {
      // argument name
      curOpt = opt;
      arg[curOpt] = true;
    }
  }
  return arg;  
}

const args = getTaskArguments(process.argv);

gulp.task('build', await build(args));
gulp.task('dev-build', await devBuild(args));