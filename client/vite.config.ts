import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
	plugins: [react()],
	// Dedicated, fixed dev port so the Tauri studio always loads THIS app. `strictPort` makes
	// a clash fail loudly instead of silently moving to 5174 and letting Tauri (which points
	// at the fixed devUrl) load whatever else holds the default port. Keep in sync with
	// `devUrl` in widgetsack/tauri.conf.json.
	server: {
		port: 1420,
		strictPort: true
	},
	// Tauri embeds `client/build` (frontendDist). Plain Vite defaults to `dist/`, so pin the
	// output back to `build/` or the desktop bundle finds no frontend.
	build: {
		outDir: 'build',
		emptyOutDir: true
	},
	// CodeMirror (the studio's CSS editor) throws "Unrecognized extension value … multiple instances
	// of @codemirror/state" if more than one copy of that package loads — its extensions use
	// `instanceof` against the single state package. node_modules already dedupes to one version, but
	// Vite's dev pre-bundler can still split it across optimized chunks, so pin a single instance both
	// ways: dedupe the resolved module, and pre-bundle the whole CodeMirror set together.
	resolve: {
		dedupe: ['@codemirror/state', '@codemirror/view']
	},
	optimizeDeps: {
		include: [
			'@codemirror/state',
			'@codemirror/view',
			'@codemirror/language',
			'@codemirror/commands',
			'@codemirror/autocomplete',
			'@codemirror/lint',
			'@codemirror/lang-css'
		]
	},
	test: {
		environment: 'happy-dom',
		globals: true,
		setupFiles: ['./src/test-setup.ts'],
		include: ['src/**/*.{test,spec}.{js,ts,jsx,tsx}']
	}
});
