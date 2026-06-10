import { describe, expect, it, vi } from 'vitest';

// startMediaSource()/getMediaCapabilities()/mediaControl() call Tauri (no runtime in tests) — stub
// the module.
vi.mock('../../components/NowPlaying/source', () => ({
	startMediaSource: () => undefined,
	getMediaCapabilities: () => Promise.resolve(null),
	mediaControl: () => Promise.resolve()
}));
vi.mock('../../overlay', () => ({ copyToClipboard: () => Promise.resolve(true) }));

import { registerNowPlayingPlugin } from './now-playing';
import { listPlugins } from '../plugin';
import { sourceCatalogIds } from '../../core/plugin';
import { configCompleteness, createWidget, getMeta } from '../../core/widget';

// Registers the plugin + the nowplaying widget meta + the np source (was an import side-effect).
registerNowPlayingPlugin();

describe('now-playing plugin', () => {
	it('registers as a plugin with a settings panel + a media source', () => {
		const p = listPlugins().find((x) => x.id === 'now-playing');
		expect(p).toMatchObject({ id: 'now-playing', name: 'Now Playing' });
		expect(p?.settings).toBeTruthy();
		expect(p?.sources?.some((s) => s.id === 'now-playing')).toBe(true);
	});

	it('registers the nowplaying widget meta (its look ships as editable css)', () => {
		expect(getMeta('nowplaying')?.binds).toBe('none');
		const w = createWidget('nowplaying', 'np1');
		expect(w.css).toContain('.np-title');
		// fully UI-driven config (no key reachable only via raw JSON).
		const meta = getMeta('nowplaying');
		if (!meta) throw new Error('nowplaying meta not registered');
		expect(configCompleteness(meta)).toEqual([]);
	});

	it('exposes the now-playing values as bindable np.* sensors via the source catalog', () => {
		expect(sourceCatalogIds()).toEqual(
			expect.arrayContaining(['np.title', 'np.artist', 'np.progress', 'np.status'])
		);
	});
});
