import { describe, expect, it } from 'vitest';
import {
	packageTemplateId,
	packageTemplates,
	parseInstallSidecar,
	parsePluginPackage,
	reinstallSource,
	versionsDiffer
} from './pluginPackage';
import { isLeaf } from './layoutTree';

// A minimal valid leaf node (a clock widget) the structural whitelist accepts.
const leafNode = (id = 'w1') => ({
	id,
	unit: { id, type: 'clock', rect: { x: 0, y: 0, w: 160, h: 40 }, config: { format: 'HH:mm' } }
});

const manifest = (over: Record<string, unknown> = {}) =>
	JSON.stringify({
		manifestVersion: 1,
		id: 'weather-pack',
		name: 'Weather pack',
		version: '1.0.0',
		templates: [
			{
				id: 'clock-tpl',
				name: 'Big clock',
				size: { w: 200, h: 80 },
				params: [{ key: 'format', label: 'format', target: 'unit.config.format' }],
				tree: leafNode()
			}
		],
		...over
	});

describe('parsePluginPackage', () => {
	it('accepts a valid manifest and maps its template', () => {
		const r = parsePluginPackage('weather-pack', manifest());
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.pkg.manifest.name).toBe('Weather pack');
		expect(r.pkg.manifest.templates).toHaveLength(1);
		expect(r.pkg.warnings).toEqual([]);
	});

	it('rejects bad JSON, a wrong manifestVersion, and a folder/id mismatch', () => {
		expect(parsePluginPackage('weather-pack', '{nope').ok).toBe(false);
		expect(parsePluginPackage('weather-pack', manifest({ manifestVersion: 2 })).ok).toBe(false);
		const mismatch = parsePluginPackage('other-folder', manifest());
		expect(mismatch.ok).toBe(false);
		if (!mismatch.ok) expect(mismatch.reason).toContain('does not match its folder');
	});

	it('drops a malformed template with a warning but keeps the package', () => {
		const r = parsePluginPackage(
			'weather-pack',
			manifest({
				templates: [
					{ id: 'bad', name: 'Bad', size: { w: 10, h: 10 }, tree: { not: 'a node' } },
					{ id: 'good', name: 'Good', size: { w: 10, h: 10 }, tree: leafNode('g1') }
				]
			})
		);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.pkg.manifest.templates.map((t) => t.id)).toEqual(['good']);
		expect(r.pkg.warnings[0]).toContain('"bad" dropped');
	});

	it('drops a template whose param path walks the prototype chain', () => {
		const r = parsePluginPackage(
			'weather-pack',
			manifest({
				templates: [
					{
						id: 'evil',
						name: 'Evil',
						size: { w: 10, h: 10 },
						params: [{ key: '__proto__.polluted' }],
						tree: leafNode()
					}
				]
			})
		);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.pkg.manifest.templates).toEqual([]);
		expect(r.pkg.warnings[0]).toContain('malformed param spec');
	});

	it('drops a theme whose file is not a plain .css name', () => {
		const r = parsePluginPackage(
			'weather-pack',
			manifest({ theme: { name: 'Sky', file: '../escape.css' } })
		);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.pkg.manifest.theme).toBeUndefined();
		expect(r.pkg.warnings[0]).toContain('theme dropped');
	});
});

describe('parseInstallSidecar', () => {
	const sidecar = (over: Record<string, unknown> = {}) =>
		JSON.stringify({
			source: 'acme/pack',
			ref: 'main',
			version: '1.0.0',
			installedAt: 1750000000000,
			...over
		});

	it('parses a valid sidecar', () => {
		expect(parseInstallSidecar(sidecar())).toEqual({
			source: 'acme/pack',
			ref: 'main',
			version: '1.0.0',
			installedAt: 1750000000000
		});
	});

	it('fails closed on missing/empty/bad fields, bad JSON, and non-strings', () => {
		expect(parseInstallSidecar(null)).toBeNull();
		expect(parseInstallSidecar(undefined)).toBeNull();
		expect(parseInstallSidecar('{nope')).toBeNull();
		expect(parseInstallSidecar('[1]')).toBeNull();
		expect(parseInstallSidecar(sidecar({ source: '' }))).toBeNull();
		expect(parseInstallSidecar(sidecar({ ref: 42 }))).toBeNull();
		expect(parseInstallSidecar(sidecar({ version: '  ' }))).toBeNull();
		expect(parseInstallSidecar(sidecar({ installedAt: 'soon' }))).toBeNull();
		expect(parseInstallSidecar(sidecar({ installedAt: Infinity }))).toBeNull();
	});
});

describe('versionsDiffer', () => {
	it('treats any string difference (ignoring padding) as an available update', () => {
		expect(versionsDiffer('1.0.0', '1.0.0')).toBe(false);
		expect(versionsDiffer(' 1.0.0 ', '1.0.0')).toBe(false);
		expect(versionsDiffer('1.0.0', '1.0.1')).toBe(true);
		expect(versionsDiffer('2.0.0', '1.0.0')).toBe(true); // downgrade still "differs"
	});
});

describe('reinstallSource', () => {
	const base = { source: 'acme/pack', version: '1.0.0', installedAt: 0 };
	it('round-trips main/direct installs verbatim and pins other refs as tree URLs', () => {
		expect(reinstallSource({ ...base, ref: 'main' })).toBe('acme/pack');
		expect(reinstallSource({ ...base, source: 'https://x.dev/p/plugin.json', ref: 'direct' })).toBe(
			'https://x.dev/p/plugin.json'
		);
		expect(reinstallSource({ ...base, ref: 'v2' })).toBe('https://github.com/acme/pack/tree/v2');
	});
});

describe('packageTemplates', () => {
	it('namespaces ids and hands out a fresh tree per call', () => {
		const r = parsePluginPackage('weather-pack', manifest());
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		const [tpl] = packageTemplates(r.pkg.manifest);
		expect(tpl.id).toBe(packageTemplateId('weather-pack', 'clock-tpl'));
		expect(tpl.params).toHaveLength(1);
		const a = tpl.tree();
		const b = tpl.tree();
		expect(a).toEqual(b);
		expect(a).not.toBe(b); // private copy per insert
		expect(isLeaf(a)).toBe(true);
	});
});
