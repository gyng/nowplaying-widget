module.exports = {
	root: true,
	extends: [
		'eslint:recommended',
		'plugin:@typescript-eslint/recommended',
		'plugin:react/recommended',
		'plugin:react/jsx-runtime',
		'plugin:react-hooks/recommended',
		'prettier'
	],
	parser: '@typescript-eslint/parser',
	plugins: ['@typescript-eslint', 'react', 'react-hooks'],
	parserOptions: {
		sourceType: 'module',
		ecmaVersion: 2022,
		ecmaFeatures: { jsx: true }
	},
	env: {
		browser: true,
		es2022: true,
		node: true
	},
	settings: {
		react: { version: 'detect' }
	}
};
