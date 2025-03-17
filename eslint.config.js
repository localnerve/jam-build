import js from '@eslint/js';
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

export default [{
  name: 'global',
  ignores: [
    '**/tmp/**',
    'node_modules/**',
    'dist/**',
    'overrides/**',
    'docs/**'
  ]
}, {
  name: 'app-client',
  files: ['src/application/client/**/*.js'],
  languageOptions: {
    globals: {
      ...globals.browser
    }
  },
  rules: {
    ...commonRules
  }
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
  files: [
    'src/test/**'
  ],
  languageOptions: {
    globals: {
      ...globals.browser
    }
  },
  rules: {
    ...commonRules
  }
}];