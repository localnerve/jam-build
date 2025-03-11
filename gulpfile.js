/**
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */
import gulp from 'gulp';

import {
  build,
  devBuild
} from './src/build/index.js';

gulp.task('build', build);
gulp.task('dev-build', devBuild);