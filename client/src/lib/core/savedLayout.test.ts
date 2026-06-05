import { describe, expect, it } from 'vitest';
import { packLayout, isSavedLayout, unpackLayout } from './savedLayout';
import { container, leaf, emptyRoot, type MonitorLayout } from './layoutTree';

const widget = { id: 'w', type: 'clock', rect: { x: 1, y: 2, w: 10, h: 10 }, config: {} };
const monitor: MonitorLayout = {
	root: container('root', 'col', [leaf(widget)]),
	floating: [leaf({ ...widget, id: 'f' })]
};

describe('packLayout', () => {
	it('wraps a monitor in a tagged, versioned profile (name omitted when blank)', () => {
		expect(packLayout(monitor)).toEqual({
			kind: 'widgetsack/layout',
			version: 2,
			monitor
		});
		expect(packLayout(monitor, 'Work').name).toBe('Work');
	});
});

describe('isSavedLayout', () => {
	it('accepts a saved layout, rejects a sack / raw widgets.json', () => {
		expect(isSavedLayout(packLayout(monitor))).toBe(true);
		expect(isSavedLayout({ kind: 'widgetsack/sack', version: 1 })).toBe(false);
		expect(isSavedLayout({ version: 2, monitors: { default: monitor } })).toBe(false);
		expect(isSavedLayout(null)).toBe(false);
	});
});

describe('unpackLayout', () => {
	it('round-trips a packed monitor through JSON', () => {
		const raw = JSON.stringify(packLayout(monitor, 'Work'));
		expect(unpackLayout(raw)).toEqual(monitor);
	});

	it('returns null for non-JSON, a sack, or a missing monitor', () => {
		expect(unpackLayout('not json')).toBeNull();
		expect(unpackLayout(JSON.stringify({ kind: 'widgetsack/sack', version: 1 }))).toBeNull();
		expect(unpackLayout(JSON.stringify({ kind: 'widgetsack/layout', version: 2 }))).toBeNull();
	});

	it('drops individually malformed floating leaves but keeps the monitor (like widgets.json)', () => {
		const dirty = {
			kind: 'widgetsack/layout',
			version: 2,
			monitor: { root: emptyRoot(), floating: [leaf(widget), { id: 'bad' }] }
		};
		const out = unpackLayout(JSON.stringify(dirty));
		expect(out?.floating.map((l) => l.id)).toEqual(['w']);
	});
});
