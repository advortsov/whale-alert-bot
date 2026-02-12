// @ts-check
import js from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import importPlugin from 'eslint-plugin-import';
import promisePlugin from 'eslint-plugin-promise';
import sonarjs from 'eslint-plugin-sonarjs';
import unusedImports from 'eslint-plugin-unused-imports';
import boundaries from 'eslint-plugin-boundaries';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // 1. Игнорируемые директории
  {
    ignores: ['dist/**', 'coverage/**', 'node_modules/**', 'database/**', '**/*.js'],
  },

  // 2. Базовые конфигурации
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  eslintPluginPrettierRecommended,

  // 3. Основные правила для TypeScript
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.node,
      },
    },
    settings: {
      'import/resolver': {
        typescript: true,
      },
      // 🔥 ИСПРАВЛЕННАЯ НАСТРОЙКА ГРАНИЦ ДЛЯ BOUNDARIES v5.x
      'boundaries/elements': [
        {
          type: 'core',
          pattern: 'src/core/**/*.ts',
        },
        {
          type: 'features',
          pattern: 'src/features/**/*.ts',
        },
        {
          type: 'integrations',
          pattern: 'src/integrations/**/*.ts',
        },
        {
          type: 'shared',
          pattern: 'src/shared/**/*.ts',
        },
        {
          type: 'config',
          pattern: 'src/config/**/*.ts',
        },
        {
          type: 'storage',
          pattern: 'src/storage/**/*.ts',
        },
        {
          type: 'chain',
          pattern: 'src/chain/**/*.ts',
        },
        {
          type: 'telegram',
          pattern: 'src/telegram/**/*.ts',
        },
        {
          type: 'health',
          pattern: 'src/health/**/*.ts',
        },
        {
          type: 'runtime',
          pattern: 'src/runtime/**/*.ts',
        },
        {
          type: 'app',
          pattern: 'src/**/*.ts',
        },
      ],
    },
    plugins: {
      import: importPlugin,
      'unused-imports': unusedImports,
      promise: promisePlugin,
      sonarjs,
      boundaries,
    },
    rules: {
      // ----- TYPESCRIPT (СТРОГО) -----
      '@typescript-eslint/explicit-function-return-type': [
        'error',
        {
          allowExpressions: true,
          allowTypedFunctionExpressions: true,
        },
      ],
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          prefer: 'type-imports',
          fixStyle: 'inline-type-imports',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-inferrable-types': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        {
          allowNumber: true,
        },
      ],
      '@typescript-eslint/consistent-type-definitions': 'off',
      '@typescript-eslint/no-extraneous-class': 'off',
      '@typescript-eslint/no-misused-promises': [
        'error',
        {
          checksVoidReturn: {
            attributes: false,
          },
        },
      ],
      '@typescript-eslint/no-unused-vars': 'off',

      // ----- UNUSED IMPORTS -----
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'error',
        {
          vars: 'all',
          varsIgnorePattern: '^_',
          args: 'after-used',
          argsIgnorePattern: '^_',
        },
      ],

      // ----- IMPORTS (АРХИТЕКТУРА) -----
      'import/order': [
        'error',
        {
          groups: [['builtin', 'external'], ['internal'], ['parent', 'sibling', 'index']],
          alphabetize: {
            order: 'asc',
            caseInsensitive: true,
          },
          'newlines-between': 'always',
        },
      ],
      'import/no-relative-parent-imports': [
        'error',
        {
          ignore: ['^(@core|@features|@shared|@config)'],
        },
      ],
      'import/no-cycle': 'error',

      // 🔥 ИСПРАВЛЕННЫЕ ПРАВИЛА BOUNDARIES ДЛЯ v5.x
      'boundaries/no-unknown': 'error',
      'boundaries/no-unknown-files': 'error',
      'boundaries/element-types': [
        'error',
        {
          default: 'disallow',
          rules: [
            // ✅ APP может зависеть от всего
            {
              from: 'app',
              allow: ['core', 'features', 'integrations', 'shared', 'config', 'storage', 'chain', 'telegram', 'health', 'runtime']
            },

            // ✅ FEATURES зависит от core, shared, config, storage
            {
              from: 'features',
              allow: ['core', 'shared', 'config', 'storage']
            },
            // ❌ FEATURES НЕ зависит от integrations (через порты!)
            {
              from: 'features',
              disallow: ['integrations']
            },
            // ❌ FEATURES НЕ зависит от других features
            {
              from: 'features',
              disallow: ['features']
            },

            // ✅ INTEGRATIONS зависит от core, shared, config
            {
              from: 'integrations',
              allow: ['core', 'shared', 'config']
            },
            // ❌ INTEGRATIONS НЕ зависит от features
            {
              from: 'integrations',
              disallow: ['features']
            },
            // ❌ INTEGRATIONS НЕ зависит от storage
            {
              from: 'integrations',
              disallow: ['storage']
            },

            // ✅ CORE зависит только от shared, config
            {
              from: 'core',
              allow: ['shared', 'config']
            },
            // ❌ CORE НЕ зависит от features, integrations, storage
            {
              from: 'core',
              disallow: ['features', 'integrations', 'storage']
            },

            // ✅ STORAGE зависит от core, config
            {
              from: 'storage',
              allow: ['core', 'config']
            },
            // ❌ STORAGE НЕ зависит от features, integrations
            {
              from: 'storage',
              disallow: ['features', 'integrations']
            },

            // ✅ CHAIN зависит от core, config, storage
            {
              from: 'chain',
              allow: ['core', 'config', 'storage']
            },
            // ❌ CHAIN НЕ зависит от features
            {
              from: 'chain',
              disallow: ['features']
            },

            // ✅ TELEGRAM зависит от features, core, config, storage
            {
              from: 'telegram',
              allow: ['features', 'core', 'config', 'storage']
            },
            // ❌ TELEGRAM НЕ зависит от integrations
            {
              from: 'telegram',
              disallow: ['integrations']
            },

            // ✅ RUNTIME зависит от core, config
            {
              from: 'runtime',
              allow: ['core', 'config']
            },

            // ✅ HEALTH зависит от всех
            {
              from: 'health',
              allow: ['core', 'features', 'integrations', 'shared', 'config', 'storage', 'chain', 'runtime']
            },

            // ✅ SHARED ни от кого не зависит
            {
              from: 'shared',
              disallow: ['core', 'features', 'integrations', 'config', 'storage', 'chain', 'telegram', 'health', 'runtime', 'app']
            },
          ],
        },
      ],

      // ----- PROMISE -----
      'promise/catch-or-return': ['error', { allowFinally: true }],

      // ----- РАЗМЕР И СЛОЖНОСТЬ -----
      'max-lines': ['error', 500],
      'max-lines-per-function': ['error', 80],
      'max-params': ['error', 4],
      'complexity': ['error', 10],

      // ----- МАГИЧЕСКИЕ ЧИСЛА -----
      'no-magic-numbers': [
        'warn',
        {
          ignore: [0, 1, -1, 2, 60, 1000, 24, 3600, 10_080],
          ignoreArrayIndexes: true,
          enforceConst: true,
        },
      ],

      // ----- SONARJS -----
      'sonarjs/no-identical-functions': ['error',  3 ],
      'sonarjs/cognitive-complexity': ['error', 15],
      'sonarjs/no-duplicate-string': ['warn', { threshold: 5 }],
      'sonarjs/no-identical-conditions': 'error',
      'sonarjs/no-identical-expressions': 'error',
      'sonarjs/no-use-of-empty-return-value': 'error',
      'sonarjs/no-collapsible-if': 'error',
      'sonarjs/no-redundant-boolean': 'error',
      'sonarjs/prefer-immediate-return': 'warn',
      'sonarjs/no-useless-catch': 'error',
      'sonarjs/prefer-while': 'warn',

      // ----- SONARJS (ВЫКЛЮЧЕННЫЕ) -----
      'sonarjs/no-all-duplicated-branches': 'off',
      'sonarjs/no-element-overwrite': 'off',
      'sonarjs/no-extra-semicolon': 'off',
      'sonarjs/no-redundant-jump': 'off',
      'sonarjs/no-nested-template-literals': 'off',

      // ----- NAMING CONVENTIONS -----
      '@typescript-eslint/naming-convention': [
        'error',
        {
          selector: 'interface',
          format: ['PascalCase'],
          prefix: ['I'],
        },
        {
          selector: 'typeAlias',
          format: ['PascalCase'],
        },
        {
          selector: 'enum',
          format: ['PascalCase'],
        },
        {
          selector: 'class',
          format: ['PascalCase'],
        },
        {
          selector: ['function', 'method'],
          format: ['camelCase'],
        },
        {
          selector: 'variable',
          format: ['camelCase', 'UPPER_CASE'],
        },
      ],

      // ----- PRETTIER -----
      'prettier/prettier': [
        'error',
        {
          endOfLine: 'lf',
          singleQuote: true,
          trailingComma: 'all',
          printWidth: 100,
        },
      ],
    },
  },

  // 4. СПЕЦИАЛЬНЫЕ ПРАВИЛА ДЛЯ ТЕСТОВ
  {
    files: ['**/*.spec.ts', '**/*.test.ts', 'test/**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.vitest,
      },
    },
    rules: {
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/unbound-method': 'off',
      'max-lines': 'off',
      'max-lines-per-function': 'off',
      'max-params': 'off',
      'complexity': 'off',
      'no-magic-numbers': 'off',
      'sonarjs/no-identical-functions': 'off',
      'sonarjs/no-duplicate-string': 'off',
      'sonarjs/cognitive-complexity': 'off',
      'import/no-relative-parent-imports': 'off',
      'import/no-cycle': 'off',
      'boundaries/element-types': 'off',
    },
  },

  // 5. СПЕЦИАЛЬНЫЕ ПРАВИЛА ДЛЯ MIGRATION SCRIPTS
  {
    files: ['database/migrations/**/*.sql.ts', 'src/storage/migrations/**/*.ts'],
    rules: {
      'no-magic-numbers': 'off',
      'max-lines': 'off',
      'sonarjs/no-duplicate-string': 'off',
      'boundaries/element-types': 'off',
    },
  },
);
