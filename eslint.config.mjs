// eslint.config.js
import js from '@eslint/js';
import ts from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import importPlugin from 'eslint-plugin-import';
import prettier from 'eslint-plugin-prettier';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import sonarjs from 'eslint-plugin-sonarjs';
import unicorn from 'eslint-plugin-unicorn';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default [
  { ignores: ['**/dist/**', '**/node_modules/**', '**/build/**'] },
  js.configs.recommended,
  // ...tseslint.configs.recommendedTypeChecked,
  tseslint.configs.eslintRecommended,
  // tseslint.configs.disableTypeChecked,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2020,
        project: './tsconfig.eslint.json',
        sourceType: 'module',
      },
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.jest,
        ...globals.commonjs,
        ...globals.es2020,
      },
    },
    ignores: ['.eslintrc.js'],
    plugins: {
      '@typescript-eslint': ts,
      prettier,
      'simple-import-sort': simpleImportSort,
      import: importPlugin,
      unicorn,
      sonarjs,
    },
    rules: {
      'prettier/prettier': [
        'error',
        {
          singleQuote: true,
          trailingComma: 'all',
          tabWidth: 2,
          bracketSpacing: true,
        },
      ],
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
      'unicorn/filename-case': ['error', { cases: { kebabCase: true, pascalCase: true } }],
      'unicorn/prefer-top-level-await': 'off',
      'unicorn/prevent-abbreviations': 'off',
      'unicorn/no-null': 'off',
      'unicorn/no-static-only-class': 'off',
      'unicorn/prefer-module': 'off',
      'unicorn/prefer-node-protocol': 'off',
      'unicorn/new-for-builtins': 'off',
      'sonarjs/no-duplicate-string': 'off',
      'import/no-unresolved': ['error', { ignore: ['^@hrdrone/*'] }],
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', vars: 'all', args: 'after-used' },
      ],
      '@typescript-eslint/array-type': ['error', { default: 'array-simple' }],
      '@typescript-eslint/no-empty-function': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'error',
      '@typescript-eslint/no-inferrable-types': 'error',
      '@typescript-eslint/no-require-imports': 'error',
      '@typescript-eslint/prefer-for-of': 'error',
      '@typescript-eslint/prefer-function-type': 'error',
      '@typescript-eslint/no-shadow': 'error',
      '@typescript-eslint/ban-ts-comment': 'error',
      '@typescript-eslint/ban-tslint-comment': 'error',
      '@typescript-eslint/no-empty-interface': 'error', // Replaces part of ban-types
      '@typescript-eslint/no-explicit-any': 'error', // Replaces part of ban-types
      // '@typescript-eslint/no-restricted-types': 'error', // Replaces part of ban-types
      '@typescript-eslint/no-extra-non-null-assertion': 'warn', // Replaces part of ban-types
      '@typescript-eslint/no-non-null-assertion': 'off', // Replaces part of ban-types
      '@typescript-eslint/no-unsafe-assignment': 'off',
      'arrow-body-style': 'error',
      'arrow-parens': ['error', 'always'],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'rxjs/Rx',
              message: "Import directly from 'rxjs' instead.",
            },
          ],
        },
      ],
      'object-curly-spacing': ['error', 'always'],
      'no-multi-spaces': 'error',
      'no-useless-return': 'error',
      'no-else-return': 'error',
      'no-implicit-coercion': 'error',
      'constructor-super': 'error',
      yoda: 'error',
      strict: ['error', 'never'],
      curly: 'error',
      'dot-notation': 'error',
      'eol-last': 'error',
      eqeqeq: ['error', 'smart'],
      'guard-for-in': 'error',
      'max-classes-per-file': ['error', 2],
      'max-len': ['error', { code: 150 }],
      'no-debugger': 'error',
      'no-duplicate-case': 'error',
      'no-empty': 'error',
      'no-eval': 'error',
      'no-extra-bind': 'error',
      'no-fallthrough': 'error',
      'no-irregular-whitespace': 'error',
      'no-multiple-empty-lines': ['error', { max: 1 }],
      'no-return-await': 'error',
      'no-sequences': 'error',
      'no-sparse-arrays': 'error',
      'no-template-curly-in-string': 'error',
      'no-unused-labels': 'error',
      'no-var': 'error',
      'object-shorthand': 'error',
      'prefer-const': 'error',
      'prefer-object-spread': 'error',
      'quote-props': ['error', 'consistent-as-needed'],
      radix: 'error',
      'use-isnan': 'error',
    },
    settings: {
      'import/resolver': {
        typescript: {},
      },
    },
  },
  // {
  //   // Add a separate configuration for test files
  //   files: ['test/**/*.ts', 'test/**/*.tsx'],
  //   plugins: {
  //     jest: jestPlugin,
  //   },
  //   env: {
  //     jest: true, // Enable Jest's global variables
  //   },
  //   rules: {
  //     // Optional: Add Jest-specific rules
  //     'jest/no-disabled-tests': 'warn',
  //     'jest/no-focused-tests': 'error',
  //     'jest/no-identical-title': 'error',
  //     'jest/prefer-to-have-length': 'warn',
  //     'jest/valid-expect': 'error',
  //   },
  // },
  // {
  //   // Add a separate configuration for test files
  //   files: ['test/**/*.ts', 'test/**/*.tsx'],
  //   languageOptions: {
  //     globals: {
  //       // Add Jest globals here
  //       expect: 'readonly',
  //       describe: 'readonly',
  //       it: 'readonly',
  //       beforeAll: 'readonly',
  //       afterAll: 'readonly',
  //       beforeEach: 'readonly',
  //       afterEach: 'readonly',
  //       jest: 'readonly',
  //     },
  //   },
  // },
];
