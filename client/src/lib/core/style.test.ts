import { describe, expect, it } from 'vitest';
import type { WidgetInstance } from './layout';
import { container, emptyRoot, group, leaf, type Library, type MonitorLayout } from './layoutTree';
import { assembleStyles, scopeCss } from './style';

const prim = (id: string, css?: string): WidgetInstance => ({
	id,
	type: 'gauge',
	rect: { x: 0, y: 0, w: 10, h: 10 },
	config: {},
	...(css ? { css } : {})
});

describe('scopeCss', () => {
	it('wraps css in the selector', () => {
		expect(scopeCss('color: red', '[data-w="x"]')).toBe('[data-w="x"] {\ncolor: red\n}');
	});
	it('returns empty for blank css', () => {
		expect(scopeCss(undefined, '[data-w="x"]')).toBe('');
		expect(scopeCss('   ', '[data-w="x"]')).toBe('');
	});
});

describe('assembleStyles', () => {
	it('orders theme → def → instance, each scoped correctly', () => {
		const lib: Library = {
			version: 1,
			defs: [
				{
					id: 'cg',
					name: 'cg',
					size: { w: 1, h: 1 },
					child: leaf(prim('x')),
					css: '.value { fill: red }'
				}
			]
		};
		const monitor: MonitorLayout = {
			root: container('root', 'col', [leaf(prim('flowA', 'color: lime'))]),
			floating: [
				leaf(prim('floatB', 'opacity: 0.5')),
				leaf(
					group('grp', { w: 1, h: 1 }, leaf(prim('inner')), { def: 'cg', css: 'filter: blur(1px)' })
				)
			]
		};
		const css = assembleStyles({ themeCss: ':root { --np-accent: gold }', library: lib, monitor });

		expect(css).toContain(':root { --np-accent: gold }');
		expect(css).toContain('[data-def="cg"] {\n.value { fill: red }\n}');
		expect(css).toContain('[data-w="flowA"] {\ncolor: lime\n}');
		expect(css).toContain('[data-w="floatB"] {\nopacity: 0.5\n}');
		expect(css).toContain('[data-group="grp"] {\nfilter: blur(1px)\n}');
		// theme first, instance css after the def css
		expect(css.indexOf(':root')).toBeLessThan(css.indexOf('[data-def='));
		expect(css.indexOf('[data-def=')).toBeLessThan(css.indexOf('[data-w="flowA"'));
	});

	it('scopes per-widget token overrides to [data-w], before that widget css', () => {
		const w: WidgetInstance = {
			id: 'w1',
			type: 'gauge',
			rect: { x: 0, y: 0, w: 10, h: 10 },
			config: {},
			tokens: { '--np-accent': 'gold' },
			css: 'color: lime'
		};
		const monitor: MonitorLayout = { root: emptyRoot(), floating: [leaf(w)] };
		const css = assembleStyles({ monitor });
		expect(css).toContain('[data-w="w1"] {\n\t--np-accent: gold;\n}');
		// the scoped tokens come before the widget's own css
		expect(css.indexOf('--np-accent: gold')).toBeLessThan(css.indexOf('color: lime'));
	});

	it('scopes per-group token overrides to [data-group]', () => {
		const monitor: MonitorLayout = {
			root: emptyRoot(),
			floating: [
				leaf(group('g1', { w: 1, h: 1 }, leaf(prim('inner')), { tokens: { '--np-fg': '#000' } }))
			]
		};
		const css = assembleStyles({ monitor });
		expect(css).toContain('[data-group="g1"] {\n\t--np-fg: #000;\n}');
	});

	it('omits a scoped token block when tokens is empty', () => {
		const w: WidgetInstance = {
			id: 'w2',
			type: 'gauge',
			rect: { x: 0, y: 0, w: 10, h: 10 },
			config: {},
			tokens: {}
		};
		const monitor: MonitorLayout = { root: emptyRoot(), floating: [leaf(w)] };
		expect(assembleStyles({ monitor })).toBe('');
	});

	it('is empty when there is no theme and no css anywhere', () => {
		const monitor: MonitorLayout = { root: emptyRoot(), floating: [leaf(prim('a'))] };
		expect(assembleStyles({ monitor })).toBe('');
	});

	it('prepends the DEFAULT_TOKENS :root base when includeDefaults, before the theme', () => {
		const monitor: MonitorLayout = { root: emptyRoot(), floating: [] };
		const css = assembleStyles({
			themeCss: ':root { --np-accent: gold }',
			monitor,
			includeDefaults: true
		});
		// the default accent appears first (the base), the theme override after it (theme wins)
		expect(css.indexOf('--np-accent: rgb(119, 196, 211)')).toBeLessThan(
			css.indexOf('--np-accent: gold')
		);
		expect(css.startsWith(':root {')).toBe(true);
	});
});
