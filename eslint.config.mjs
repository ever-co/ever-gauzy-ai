// ESLint flat config (ESLint >= 9). Ports the former .eslintrc.js: TypeScript recommended rules + Prettier.
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import prettierPlugin from 'eslint-plugin-prettier';
import prettierConfig from 'eslint-config-prettier';
import globals from 'globals';

export default [
	{ ignores: ['dist/**', 'node_modules/**', 'sdk/**', 'coverage/**', '**/*.js', '**/*.mjs'] },
	{
		files: ['**/*.ts'],
		languageOptions: {
			parser: tsParser,
			parserOptions: { project: './tsconfig.json', sourceType: 'module' },
			globals: { ...globals.node, ...globals.jest },
		},
		plugins: { '@typescript-eslint': tsPlugin, prettier: prettierPlugin },
		rules: {
			...tsPlugin.configs['eslint-recommended'].overrides[0].rules,
			...tsPlugin.configs.recommended.rules,
			...prettierConfig.rules,
			'prettier/prettier': ['warn', { endOfLine: 'auto' }],
			'@typescript-eslint/explicit-function-return-type': 'off',
			'@typescript-eslint/no-explicit-any': 'off',
			'@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
			'@typescript-eslint/no-empty-object-type': 'warn',
			'@typescript-eslint/ban-ts-comment': ['error', { 'ts-ignore': 'allow-with-description' }],
		},
	},
	{
		// specs use jest.requireActual() / require() for module mocks
		files: ['**/*.spec.ts'],
		rules: { '@typescript-eslint/no-require-imports': 'off' },
	},
];
