import js from '@eslint/js';
import babelParser from '@babel/eslint-parser';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  { ignores: ['dist/**', 'data/**', 'review/**', 'node_modules/**'] },
  js.configs.recommended,
  {
    files: ['src/**/*.{js,jsx}', 'server/**/*.js'],
    languageOptions: { parser: babelParser, parserOptions: { requireConfigFile: false, babelOptions: { presets: ['@babel/preset-react'] } }, ecmaVersion: 'latest', sourceType: 'module', globals: { ...globals.browser, ...globals.node } },
    plugins: { 'react-hooks': reactHooks },
    rules: { ...reactHooks.configs.recommended.rules, 'no-unused-vars': ['error', { argsIgnorePattern: '^_' }] },
  },
  {
    files: ['src/**/*.jsx'],
    rules: {
      // The lightweight configuration does not include a JSX-usage rule; Vite's React compiler performs JSX validation.
      'no-unused-vars': 'off',
      'react-hooks/set-state-in-effect': 'off',
    },
  },
];
