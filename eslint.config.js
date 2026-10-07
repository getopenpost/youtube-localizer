import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'dist-firefox/**',
      'node_modules/**',
      'test-results/**',
      'playwright-report/**',
      '.impeccable/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...svelte.configs['flat/recommended'],
  {
    files: ['**/*.svelte'],
    languageOptions: {
      globals: { ...globals.browser, chrome: 'readonly' },
      parserOptions: { parser: tseslint.parser },
    },
  },
  {
    files: ['scripts/*.mjs'],
    languageOptions: { globals: { console: 'readonly', process: 'readonly' } },
  },
);
