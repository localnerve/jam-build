/**
 * Eslint config.
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
import js from '@eslint/js';
import compat from "eslint-plugin-compat";
import playwright from 'eslint-plugin-playwright';
import globals from 'globals';

const commonRules = {
  ...js.configs.recommended.rules,
  'no-console': 'warn',
  'no-param-reassign': 'error',
  indent: [2, 2, {
    SwitchCase: 1,
    MemberExpression: 1
  }],
  quotes: [2, 'single'],
  'dot-notation': [2, {allowKeywords: true}],
  'linebreak-style': [
    'error',
    'unix'
  ],
  semi: [
    'error',
    'always'
  ]
};

const compatConfig = compat.configs["flat/recommended"];
compatConfig.rules = { ...compatConfig.rules, ...commonRules };

export default [{
  name: 'global',
  ignores: [
    '**/tmp/**',
    'node_modules/**',
    'dist/**',
    'overrides/**',
    'docs/**',
    'coverage/**',
    'test-results/**'
  ]
}, {
  name: 'app-client',
  files: ['src/application/client/**/*.js'],
  ...compatConfig
}, {
  name: 'app-sw',
  files: [
    'src/application/client/sw/**'
  ],
  languageOptions: {
    globals: {
      ...globals.serviceworker
    }
  },
  rules: {
    ...commonRules
  }
}, {
  name: 'node-build-and-app',
  files: [
    'src/build/**',
    'src/application/server/**/*.js'
  ],
  languageOptions: {
    globals: {
      ...globals.node
    }
  },
  rules: {
    ...commonRules
  }
}, {
  name: 'test',
  ...playwright.configs['flat/recommended'],
  files: [
    'src/test/**/*.test.js'
  ],
  languageOptions: {
    globals: {
      ...globals.node
    }
  },
  rules: {
    ...playwright.configs['flat/recommended'].rules,
    ...commonRules
  }
}];