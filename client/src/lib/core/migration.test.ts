import { describe, expect, it } from 'vitest';
import type { Layout as LayoutV1, WidgetInstance } from './layout';
import { migrateV1, parseLayoutAny } from './migration';

const widget = (id: string, x: number, y: number, w: number, h: number): WidgetInstance => ({
	id,
	type: 'gauge',
	rect: { x, y, w, h },
	config: {}
});

describe('migrateV1', () => {
	it('wraps every widget as a floating leaf under an empty root, rects verbatim', () => {
		const v1: LayoutV1 = {
			version: 1,
			monitors: {
				default: { widgets: [widget('g', 10, 10, 100, 100), widget('clk', 200, 10, 160, 40)] }
			}
		};
		const v2 = migrateV1(v1);
		expect(v2.version).toBe(2);
		expect(v2.monitors.default.root).toEqual({ id: 'root', kind: 'col', children: [] });
		expect(v2.monitors.default.floating).toHaveLength(2);
		expect(v2.monitors.default.floating[0]).toEqual({
			id: 'g',
			unit: widget('g', 10, 10, 100, 100)
		});
		expect((v2.monitors.default.floating[1].unit as WidgetInstance).rect).toEqual({
			x: 200,
			y: 10,
			w: 160,
			h: 40
		});
	});

	it('drops a v1 widget whose rect is not a full numeric rect', () => {
		const v1 = {
			version: 1,
			monitors: { default: { widgets: [{ id: 'w', type: 'gauge', rect: {}, config: {} }] } }
		} as unknown as LayoutV1;
		expect(migrateV1(v1).monitors.default.floating).toHaveLength(0);
	});
});

describe('parseLayoutAny', () => {
	const validWidget = widget('w1', 0, 0, 10, 10);

	it('migrates a v1 layout to v2 floating', () => {
		const r = parseLayoutAny({ version: 1, monitors: { default: { widgets: [validWidget] } } });
		expect(r?.version).toBe(2);
		expect(r?.monitors.default.root.children).toHaveLength(0);
		expect(r?.monitors.default.floating).toHaveLength(1);
		expect(r?.monitors.default.floating[0].unit.id).toBe('w1');
	});

	it('passes a valid v2 layout through (root tree + floating)', () => {
		const r = parseLayoutAny({
			version: 2,
			monitors: {
				default: {
					root: { id: 'r', kind: 'row', children: [{ id: 'L', unit: validWidget }] },
					floating: [{ id: 'F', unit: widget('w2', 5, 5, 20, 20) }]
				}
			}
		});
		expect(r?.version).toBe(2);
		expect(r?.monitors.default.root.children).toHaveLength(1);
		expect(r?.monitors.default.floating).toHaveLength(1);
	});

	it('treats a versionless legacy file as v1', () => {
		const r = parseLayoutAny({ monitors: { default: { widgets: [validWidget] } } });
		expect(r).not.toBeNull();
		expect(r?.version).toBe(2);
		expect(r?.monitors.default.floating).toHaveLength(1);
	});

	it('drops malformed v2 floating leaves but keeps valid ones', () => {
		const r = parseLayoutAny({
			version: 2,
			monitors: {
				default: {
					root: { id: 'r', kind: 'col', children: [] },
					floating: [{ id: 'F', unit: validWidget }, { id: 'bad' }, 42]
				}
			}
		});
		expect(r?.monitors.default.floating).toHaveLength(1);
	});

	it('tolerates a missing v2 root by substituting an empty root', () => {
		const r = parseLayoutAny({ version: 2, monitors: { m: { floating: [] } } });
		expect(r).not.toBeNull();
		expect(r?.monitors.m.root).toEqual({ id: 'root', kind: 'col', children: [] });
	});

	it('returns null on unrecoverable structural failure', () => {
		expect(parseLayoutAny(null)).toBeNull();
		expect(parseLayoutAny('nope')).toBeNull();
		expect(parseLayoutAny({ version: 2 })).toBeNull(); // no monitors
		expect(
			parseLayoutAny({
				version: 2,
				monitors: { m: { root: { id: 'r', kind: 'bogus', children: [] } } }
			})
		).toBeNull(); // bad container kind fails the monitor
		expect(parseLayoutAny({ version: 3, monitors: {} })).toBeNull(); // unknown future version
	});

	it('rejects an array for monitors (must be a Record)', () => {
		expect(parseLayoutAny({ version: 2, monitors: [] })).toBeNull();
		expect(
			parseLayoutAny({ version: 2, monitors: [{ root: { id: 'r', kind: 'col', children: [] } }] })
		).toBeNull();
	});

	it('returns null for a stringy version (hand-edited legacy file)', () => {
		expect(
			parseLayoutAny({ version: '1', monitors: { default: { widgets: [validWidget] } } })
		).toBeNull();
	});
});
