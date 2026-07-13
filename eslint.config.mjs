// zeta-riemannian-agent v1.0 — ESLint flat config
//
// Stack: TypeScript + Bun + Node.js. No React, no Next.js.
// Goal: catch real bugs (unused vars, unhandled promises, type-unsafe any)
// without being so noisy that developers disable the whole thing.
//
// Run: bun run lint

import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // ─── Base: recommended JS + TS rules ────────────────────────────────
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // ─── Project source files ──────────────────────────────────────────
  {
    files: ['src/**/*.ts', 'mini-services/**/*.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        // Node.js globals available in the agent runtime + web server
        process: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        setImmediate: 'readonly',
        clearImmediate: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        URL: 'readonly',
        fetch: 'readonly',
      },
    },
    rules: {
      // ── Strictness: keep these ON ──────────────────────────────────
      // Catches real bugs.
      'no-unused-vars': 'off', // off because @typescript-eslint/no-unused-vars is on
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      'no-undef': 'off', // TS handles this; the JS rule false-positives on ESM
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-console': 'off', // logging is intentional in this agent
      'prefer-const': 'warn',
      'no-var': 'error',
      'no-redeclare': 'off', // TS handles this better
      '@typescript-eslint/no-redeclare': 'error',
      'no-unreachable': 'warn',
      'no-case-declarations': 'warn',
      'no-fallthrough': 'warn',
      'no-debugger': 'warn',

      // ── TypeScript-specific ────────────────────────────────────────
      // Allow `any` because we interface with the ZAI SDK and Prisma
      // internals that don't always ship proper types, but warn so it
      // stays visible.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-non-null-assertion': 'off', // we use `!` deliberately on Prisma results
      '@typescript-eslint/ban-ts-comment': 'warn',
      '@typescript-eslint/no-unused-expressions': 'warn',
      '@typescript-eslint/consistent-type-imports': [
        'warn',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],

      // ── Async / promises ───────────────────────────────────────────
      'require-await': 'warn',
      'no-async-promise-executor': 'error',
      'no-return-await': 'warn',
    },
  },

  // ─── Web server (CommonJS) ─────────────────────────────────────────
  {
    files: ['web/server.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        require: 'readonly',
        module: 'readonly',
        exports: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        process: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        URL: 'readonly',
      },
    },
    rules: {
      // Disable all TS-specific rules in plain JS files (they false-positive).
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/consistent-type-imports': 'off',
      // Plain JS rules.
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      'no-undef': 'off',
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-console': 'off',
      'prefer-const': 'warn',
      'no-var': 'error',
      'no-unreachable': 'warn',
      'no-fallthrough': 'warn',
      'no-dupe-keys': 'error',
    },
  },

  // ─── Dashboard vanilla JS (browser) ────────────────────────────────
  {
    files: ['web/public/js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        io: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        fetch: 'readonly',
        location: 'readonly',
      },
    },
    rules: {
      // Disable all TS-specific rules in plain JS files.
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/consistent-type-imports': 'off',
      // Plain JS rules.
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      'no-undef': 'off',
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-console': 'off',
      'prefer-const': 'warn',
      'no-var': 'off',
      'no-unreachable': 'warn',
      'no-fallthrough': 'warn',
      'no-debugger': 'warn',
    },
  },

  // ─── Shell scripts sanity (no-op for ESLint, but keeps config explicit) ─
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'out/**',
      'build/**',
      'dist/**',
      'next-env.d.ts',
      'examples/**',
      'skills/**',
      'prisma/db/**',
      'research/**',
      'docs/**',
      'public/**',
      'bun.lock',
      'package-lock.json',
      '*.md',
      '*.json',
      '*.jpg',
      '*.png',
      '*.svg',
      '*.db',
      '*.log',
    ],
  }
);
