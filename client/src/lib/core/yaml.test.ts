import { describe, expect, it } from 'vitest';
import { toYaml } from './yaml';

describe('toYaml', () => {
	it('emits scalars', () => {
		expect(toYaml(null)).toBe('null');
		expect(toYaml(true)).toBe('true');
		expect(toYaml(42)).toBe('42');
		expect(toYaml('hello')).toBe('hello');
	});

	it('quotes ambiguous strings (numbers, bools, empties, indicators)', () => {
		expect(toYaml('123')).toBe('"123"');
		expect(toYaml('true')).toBe('"true"');
		expect(toYaml('')).toBe('""');
		expect(toYaml('- leading dash')).toBe('"- leading dash"');
		expect(toYaml('a: b')).toBe('"a: b"');
	});

	it('emits a flat object', () => {
		expect(toYaml({ type: 'gauge', min: 0, max: 100 })).toBe('type: gauge\nmin: 0\nmax: 100');
	});

	it('nests objects on indented lines', () => {
		expect(toYaml({ rect: { x: 1, y: 2 } })).toBe('rect:\n  x: 1\n  y: 2');
	});

	it('renders an array of objects with the first key inline after the dash', () => {
		const y = toYaml({ actions: [{ domain: 'media', service: 'playpause' }] });
		expect(y).toBe('actions:\n  - domain: media\n    service: playpause');
	});

	it('renders empty array / object inline', () => {
		expect(toYaml({ actions: [], config: {} })).toBe('actions: []\nconfig: {}');
	});

	it('renders a multi-line string as a block scalar (e.g. css)', () => {
		const y = toYaml({ css: '.a {\n  color: red;\n}' });
		expect(y).toBe('css: |-\n  .a {\n    color: red;\n  }');
	});

	it('round-trips structurally through a known node shape', () => {
		const node = {
			id: 'gauge-1',
			unit: { id: 'gauge-1', type: 'gauge', config: { label: 'CPU' } },
			basis: { fr: 1 }
		};
		const y = toYaml(node);
		expect(y).toContain('id: gauge-1');
		expect(y).toContain('unit:');
		expect(y).toContain('  type: gauge');
		expect(y).toContain('basis:\n  fr: 1');
	});
});
