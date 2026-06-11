import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// The repo's reference package (examples/packages/sample-pack) — parsed, scanned, and RUN here so
// the sample the docs point at can never drift from the real schema or the sandbox contract.
// vite's import.meta.url shim isn't a file URL under the test transform and the process cwd
// varies by invocation (client/ vs repo root), so walk up from cwd to find the repo root.
const REL = 'examples/packages/sample-pack';
function sampleDir(): string {
	let d = process.cwd();
	for (let i = 0; i < 6; i++) {
		if (existsSync(resolve(d, REL, 'plugin.json'))) return resolve(d, REL);
		d = resolve(d, '..');
	}
	throw new Error(`examples/packages/sample-pack not found above ${process.cwd()}`);
}
const dir = sampleDir();
const read = (name: string): string => readFileSync(resolve(dir, name), 'utf8');

// Stub only the Tauri command module; the QuickJS sandbox is the real one.
const fetches: { id: string; url: string }[] = [];
vi.mock('./packages-commands', () => ({
	readPluginPackageAsset: (_id: string, name: string) => Promise.resolve(read(name)),
	packageFetch: (id: string, url: string) => {
		fetches.push({ id, url });
		return Promise.resolve({
			url,
			status: 200,
			body: JSON.stringify({ current: { temperature_2m: 31.4, wind_speed_10m: 9.7 } })
		});
	}
}));

import { parsePluginPackage } from '../../core/pluginPackage';
import { scanCssThreats } from '../../core/cssThreats';
import { createTelemetryHub } from '../../core/telemetry';
import { startPackageSource } from './packages-source';

async function until(pred: () => boolean): Promise<void> {
	for (let i = 0; i < 300 && !pred(); i++) await new Promise((r) => setTimeout(r, 10));
	expect(pred()).toBe(true);
}

afterEach(() => {
	fetches.length = 0;
});

describe('examples/packages/sample-pack', () => {
	it('parses clean: both templates, theme, source, and sensors survive validation', () => {
		const r = parsePluginPackage('sample-pack', read('plugin.json'));
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.pkg.warnings).toEqual([]);
		expect(r.pkg.manifest.templates.map((t) => t.id)).toEqual(['clock', 'weather']);
		expect(r.pkg.manifest.theme?.file).toBe('sample.css');
		expect(r.pkg.manifest.source?.hosts).toEqual(['api.open-meteo.com']);
		expect(r.pkg.manifest.sensors.map((s) => s.id)).toEqual(['temp', 'wind']);
	});

	it('ships a threat-free theme (no consent dialog needed)', () => {
		expect(scanCssThreats(read('sample.css'))).toEqual([]);
	});

	it('source.js runs in the real sandbox: fetches only the declared host, ingests temp + wind', async () => {
		const r = parsePluginPackage('sample-pack', read('plugin.json'));
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		const hub = createTelemetryHub();
		const stop = await startPackageSource(r.pkg.manifest, hub);
		try {
			await until(() => hub.sensor('pkg.sample-pack.temp').getSnapshot().value !== null);
			expect(fetches).toHaveLength(1);
			expect(new URL(fetches[0].url).hostname).toBe('api.open-meteo.com');
			const scalar = (id: string) => {
				const v = hub.sensor(id).getSnapshot().value;
				return v?.kind === 'scalar' ? v.value : null;
			};
			expect(scalar('pkg.sample-pack.temp')).toBe(31.4);
			expect(scalar('pkg.sample-pack.wind')).toBe(9.7);
			const status = hub.sensor('pkg.sample-pack.status').getSnapshot().value;
			expect(status?.kind === 'text' && status.value).toBe('ok');
		} finally {
			stop();
		}
	});
});
