import { describe, expect, it } from 'vitest';
import { isSack, mergeLibrary, packSack, unpackSack } from './sack';
import type { Leaf, Library, WidgetDef } from './layoutTree';

const widgetLeaf = (id: string): Leaf => ({
	id,
	unit: { id, type: 'text', rect: { x: 0, y: 0, w: 1, h: 1 }, config: {} }
});

const groupLeaf = (id: string, def: string): Leaf => ({
	id,
	unit: { id, kind: 'group', def, size: { w: 1, h: 1 }, child: widgetLeaf(`${id}-c`) }
});

const mkDef = (id: string, child: Leaf = widgetLeaf(`${id}-c`)): WidgetDef => ({
	id,
	name: id.toUpperCase(),
	size: { w: 10, h: 10 },
	child
});

describe('sack pack/unpack', () => {
	it('round-trips a library + theme through pack -> JSON -> unpack', () => {
		const library: Library = { version: 1, defs: [mkDef('a')] };
		const sack = packSack({ library, theme: { name: 't', css: ':root{}' }, name: 'mine' });
		const round = unpackSack(JSON.stringify(sack));
		expect(round).toEqual(sack);
		expect(round?.library?.defs[0].id).toBe('a');
		expect(round?.theme?.name).toBe('t');
	});

	it('omits empty parts when packing', () => {
		expect(packSack({ library: { version: 1, defs: [] } })).toEqual({
			kind: 'widgetsack/sack',
			version: 1
		});
	});

	it('isSack rejects a raw widgets.json (no kind tag), and unpack rejects malformed input', () => {
		expect(isSack({ version: 2, monitors: {} })).toBe(false);
		expect(unpackSack('{"version":2,"monitors":{}}')).toBeNull();
		expect(unpackSack('not json')).toBeNull();
	});
});

describe('mergeLibrary', () => {
	it('appends non-colliding defs unchanged', () => {
		const into: Library = { version: 1, defs: [mkDef('a')] };
		const { library, idMap } = mergeLibrary(into, [mkDef('b')]);
		expect(library.defs.map((d) => d.id)).toEqual(['a', 'b']);
		expect(idMap).toEqual({ b: 'b' });
	});

	it('regenerates a colliding def id', () => {
		const into: Library = { version: 1, defs: [mkDef('a')] };
		const { library, idMap } = mergeLibrary(into, [mkDef('a')]);
		expect(idMap.a).toBe('a-2');
		expect(library.defs.map((d) => d.id)).toEqual(['a', 'a-2']);
	});

	it('rewrites nested group.def cross-references when both defs are remapped', () => {
		const into: Library = { version: 1, defs: [mkDef('a'), mkDef('b')] };
		const incomingA = mkDef('a', groupLeaf('g', 'b')); // A references B via a nested group
		const incomingB = mkDef('b');
		const { library, idMap } = mergeLibrary(into, [incomingA, incomingB]);
		expect(idMap).toEqual({ a: 'a-2', b: 'b-2' });
		const mergedA = library.defs.find((d) => d.id === 'a-2');
		const grp = (mergedA?.child as Leaf).unit as { def: string };
		expect(grp.def).toBe('b-2'); // points to B's NEW id
	});

	it('does not mutate the incoming defs', () => {
		const incoming = mkDef('a', groupLeaf('g', 'a'));
		const into: Library = { version: 1, defs: [mkDef('a')] };
		mergeLibrary(into, [incoming]);
		expect(incoming.id).toBe('a');
		expect(((incoming.child as Leaf).unit as { def: string }).def).toBe('a');
	});
});
