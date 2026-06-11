// @ts-check
const eslint = require('@eslint/js');
const { defineConfig } = require('eslint/config');
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');
const importX = require('eslint-plugin-import-x');
const prettier = require('eslint-config-prettier');

module.exports = defineConfig([
  {
    files: ['**/*.ts'],
    extends: [
      eslint.configs.recommended,
      tseslint.configs.recommended,
      tseslint.configs.stylistic,
      angular.configs.tsRecommended,
      prettier,
    ],
    processor: angular.processInlineTemplates,
    plugins: {
      'import-x': importX,
    },
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        { type: 'attribute', prefix: 'app', style: 'camelCase' },
      ],
      '@angular-eslint/component-selector': [
        'error',
        { type: 'element', prefix: 'app', style: 'kebab-case' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      'import-x/no-restricted-paths': [
        'error',
        {
          zones: [
            // El dominio (L1) es independiente: no conoce ninguna capa hacia afuera.
            { target: './src/L1_domain', from: './src/L2_application' },
            { target: './src/L1_domain', from: './src/L3_periphery' },
            { target: './src/L1_domain', from: './src/LR_render' },
            // La aplicación (L2) solo conoce el dominio.
            { target: './src/L2_application', from: './src/L3_periphery' },
            { target: './src/L2_application', from: './src/LR_render' },
            // La periferia (L3) puede orquestar use cases L2 (típicamente guards).
            // Lo prohibido es importar UI: LR no debe filtrarse en adapters.
            { target: './src/L3_periphery', from: './src/LR_render' },
            // LR PUEDE importar guards de L3 (primitivos de routing, no son
            // implementaciones de ports). NO debe importar adapters HTTP/storage
            // — eso lo audita `hexagonal-guard` subagente. La inyección de ports
            // por InjectionToken en `app.config.ts` sigue siendo el patrón
            // obligatorio para todo lo que NO sea routing flow.
          ],
        },
      ],
    },
  },
  {
    files: ['src/L1_domain/**/*.ts', 'src/L2_application/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@angular/*'],
              message: 'L1 y L2 son TypeScript puro — no importar Angular.',
            },
            {
              group: ['rxjs', 'rxjs/*'],
              message: 'L1 y L2 no usan RxJS — usar Promises o tipos planos.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.html'],
    extends: [angular.configs.templateRecommended, angular.configs.templateAccessibility],
    rules: {},
  },
]);
