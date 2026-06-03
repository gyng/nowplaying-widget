import { describe, it, expect } from 'vitest';
import { splitNode } from './useEditorModel';
import {
	container,
	leaf,
	isContainer,
	type Container,
	type MonitorLayout
} from '../../core/layoutTree';
import type { EditorState } from './types';

function stub(root: Container): EditorState {
	return {
		monitor: { root, floating: [] } as MonitorLayout,
		library: undefined,
		selectedId: null,
		selectedIds: [],
		lastPrimary: null,
		selectedTheme: '',
		tokenOverrides: {},
		editingDefId: null,
		savedMonitor: null,
		defEditBaseline: null,
		undoStack: [],
		redoStack: [],
		lastSnap: null,
		historyReady: true,
		savedBaseline: null,
		pendingExtras: [],
		saveSeq: 0,
		studio: true
	} as EditorState;
}

const rootOf = (p: ReturnType<typeof splitNode>) => (p.monitor as MonitorLayout).root;
const kinds = (c: Container) => c.children.filter(isContainer).map((k) => (k as Container).kind);

describe('splitNode band orientation', () => {
	it('"into rows" → a col parent holding row bands', () => {
		const root = rootOf(splitNode(stub(container('root', 'col', [])), 'root', 'rows'));
		expect(root.kind).toBe('col'); // the stacker
		expect(kinds(root)).toEqual(['row', 'row']); // the two rows
	});

	it('"into cols" → a row parent holding col strips', () => {
		const root = rootOf(splitNode(stub(container('root', 'col', [])), 'root', 'cols'));
		expect(root.kind).toBe('row');
		expect(kinds(root)).toEqual(['col', 'col']);
	});

	it('preserves the existing content kind in the kept band, new band takes the orientation', () => {
		// A populated grid node split into rows: keep stays grid (so its content does not re-flow),
		// the freshly added band is a row.
		const populated = container('root', 'grid', [
			leaf({ id: 'w', type: 'clock', rect: { x: 0, y: 0, w: 10, h: 10 }, config: {} })
		]);
		const root = rootOf(splitNode(stub(populated), 'root', 'rows'));
		expect(root.kind).toBe('col');
		expect(kinds(root)).toEqual(['grid', 'row']);
	});

	it('"into grid" → a 2×2 grid of col cells', () => {
		const root = rootOf(splitNode(stub(container('root', 'col', [])), 'root', 'grid'));
		expect(root.kind).toBe('grid');
		expect(root.cols).toBe(2);
		expect(kinds(root)).toEqual(['col', 'col', 'col', 'col']);
	});
});
