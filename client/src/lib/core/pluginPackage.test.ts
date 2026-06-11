import { describe, expect, it } from 'vitest';
import {
	consentFingerprint,
	enableConsentMessage,
	MAX_SOURCE_REQUESTS,
	MAX_SOURCE_SAMPLES,
	packageSensorId,
	packageTemplateId,
	packageTemplates,
	parseInstallSidecar,
	parsePluginPackage,
	reinstallSource,
	validateSourceRequests,
	validateSourceSamples,
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

describe('parsePluginPackage — source + sensors (Phase 2)', () => {
	const source = (over: Record<string, unknown> = {}) => ({
		file: 'source.js',
		pollSeconds: 60,
		hosts: ['api.open-meteo.com'],
		...over
	});
	const sensors = [
		{ id: 'temp', label: 'Temperature', unit: '°C' },
		{ id: 'humidity', label: 'Humidity', unit: '%' }
	];
	const parse = (over: Record<string, unknown>) => {
		const r = parsePluginPackage('weather-pack', manifest(over));
		expect(r.ok).toBe(true);
		if (!r.ok) throw new Error('unreachable');
		return r.pkg;
	};

	it('accepts a valid source + sensors', () => {
		const pkg = parse({ source: source(), sensors });
		expect(pkg.manifest.source).toEqual({
			file: 'source.js',
			pollSeconds: 60,
			hosts: ['api.open-meteo.com']
		});
		expect(pkg.manifest.sensors).toEqual(sensors);
		expect(pkg.warnings).toEqual([]);
	});

	it('defaults sensors to [] and leaves source undefined when undeclared', () => {
		const pkg = parse({});
		expect(pkg.manifest.source).toBeUndefined();
		expect(pkg.manifest.sensors).toEqual([]);
		expect(pkg.warnings).toEqual([]);
	});

	it('clamps pollSeconds to [15, 3600] and defaults a missing one to 60', () => {
		expect(parse({ source: source({ pollSeconds: 1 }) }).manifest.source?.pollSeconds).toBe(15);
		expect(parse({ source: source({ pollSeconds: 99999 }) }).manifest.source?.pollSeconds).toBe(
			3600
		);
		expect(parse({ source: source({ pollSeconds: undefined }) }).manifest.source?.pollSeconds).toBe(
			60
		);
	});

	it('drops a source (with a warning) when the file is not a plain .js name', () => {
		for (const file of ['source.css', '../escape.js', 'a.b.js', 'noext', 'source.mjs']) {
			const pkg = parse({ source: source({ file }) });
			expect(pkg.manifest.source).toBeUndefined();
			expect(pkg.warnings[0]).toContain('source dropped');
		}
	});

	it('drops a source on bad hosts: empty, uppercase, scheme/port/path/wildcard, IP literal', () => {
		const bad = [
			[],
			['API.Open-Meteo.com'],
			['https://api.open-meteo.com'],
			['api.open-meteo.com:443'],
			['api.open-meteo.com/v1'],
			['*.open-meteo.com'],
			['192.168.1.10'],
			['ok.example.com', ''] // one bad entry poisons the list
		];
		for (const hosts of bad) {
			const pkg = parse({ source: source({ hosts }) });
			expect(pkg.manifest.source).toBeUndefined();
			expect(pkg.warnings[0]).toContain('"hosts"');
		}
	});

	it('drops a non-numeric pollSeconds with a warning', () => {
		const pkg = parse({ source: source({ pollSeconds: 'fast' }) });
		expect(pkg.manifest.source).toBeUndefined();
		expect(pkg.warnings[0]).toContain('pollSeconds');
	});

	it('drops malformed sensors (bad id, duplicate, non-string label) but keeps the package', () => {
		for (const bad of [
			[{ id: 'a/b' }],
			[{ id: 'x' }, { id: 'x' }],
			[{ id: 'x', label: 42 }],
			['nope']
		]) {
			const pkg = parse({ source: source(), sensors: bad });
			expect(pkg.manifest.sensors).toEqual([]);
			expect(pkg.warnings[0]).toContain('sensors dropped');
			expect(pkg.manifest.source).toBeDefined(); // source survives a sensors drop
		}
	});
});

describe('packageSensorId / consentFingerprint / enableConsentMessage', () => {
	it('namespaces sensor ids under pkg.<pkgId>.', () => {
		expect(packageSensorId('weather-pack', 'temp')).toBe('pkg.weather-pack.temp');
	});

	it('fingerprints hosts order-insensitively but change-sensitively', () => {
		expect(consentFingerprint(['b.com', 'a.com'])).toBe(consentFingerprint(['a.com', 'b.com']));
		expect(consentFingerprint(['a.com'])).not.toBe(consentFingerprint(['a.com', 'b.com']));
		expect(consentFingerprint(['a.com'])).not.toBe(consentFingerprint(['c.com']));
	});

	it('states the network facts, the css facts, or both in ONE message', () => {
		const net = enableConsentMessage({ hosts: ['api.open-meteo.com'], pollSeconds: 60 });
		expect(net).toContain('polls the network every 60s: api.open-meteo.com');
		expect(net).toContain('Enable?');
		const css = enableConsentMessage({ cssSummary: '1 remote import' });
		expect(css).toContain('theme contains 1 remote import');
		expect(css).toContain('Enable anyway?');
		const both = enableConsentMessage({
			cssSummary: '1 remote import',
			hosts: ['a.com', 'b.com'],
			pollSeconds: 300
		});
		expect(both).toContain('theme contains');
		expect(both).toContain('every 300s: a.com, b.com');
	});
});

describe('validateSourceRequests', () => {
	it('keeps https string URLs and reports everything else', () => {
		const r = validateSourceRequests(['https://a.com/x', 'http://a.com', 42, 'ftp://x']);
		expect(r.urls).toEqual(['https://a.com/x']);
		expect(r.dropped).toHaveLength(3);
	});

	it('caps at MAX_SOURCE_REQUESTS and rejects non-arrays', () => {
		const many = Array.from({ length: 20 }, (_, i) => `https://a.com/${i}`);
		const r = validateSourceRequests(many);
		expect(r.urls).toHaveLength(MAX_SOURCE_REQUESTS);
		expect(r.dropped[0]).toContain('cap');
		expect(validateSourceRequests('nope').urls).toEqual([]);
		expect(validateSourceRequests('nope').dropped[0]).toContain('array');
	});
});

describe('validateSourceSamples', () => {
	const declared = ['temp', 'label'];

	it('keeps declared finite-number and bounded-string samples', () => {
		const r = validateSourceSamples(declared, [
			{ sensor: 'temp', value: 21.5 },
			{ sensor: 'label', value: 'sunny' }
		]);
		expect(r.samples).toEqual([
			{ sensor: 'temp', value: 21.5 },
			{ sensor: 'label', value: 'sunny' }
		]);
		expect(r.dropped).toEqual([]);
	});

	it('drops undeclared sensors, non-finite numbers, oversized strings, junk entries', () => {
		const r = validateSourceSamples(declared, [
			{ sensor: 'sneaky', value: 1 },
			{ sensor: 'temp', value: Infinity },
			{ sensor: 'temp', value: NaN },
			{ sensor: 'label', value: 'x'.repeat(2000) },
			{ sensor: 'temp', value: { nested: true } },
			'junk',
			{ value: 1 }
		]);
		expect(r.samples).toEqual([]);
		expect(r.dropped).toHaveLength(7);
		expect(r.dropped[0]).toContain('undeclared sensor "sneaky"');
	});

	it('caps at MAX_SOURCE_SAMPLES and rejects non-arrays', () => {
		const many = Array.from({ length: 100 }, () => ({ sensor: 'temp', value: 1 }));
		const r = validateSourceSamples(declared, many);
		expect(r.samples).toHaveLength(MAX_SOURCE_SAMPLES);
		expect(r.dropped[0]).toContain('cap');
		expect(validateSourceSamples(declared, null).dropped[0]).toContain('array');
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
