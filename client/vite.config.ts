import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [sveltekit()],
	// Dedicated, fixed dev port so the Tauri studio always loads THIS app. `strictPort` makes
	// a clash fail loudly instead of silently moving to 5174 and letting Tauri (which points
	// at the fixed devUrl) load whatever else holds the default port. Keep in sync with
	// `devUrl` in widgetsack/tauri.conf.json.
	server: {
		port: 1420,
		strictPort: true
	},
	test: {
		environment: 'happy-dom',
		include: ['src/**/*.{test,spec}.{js,ts}']
	}
});
