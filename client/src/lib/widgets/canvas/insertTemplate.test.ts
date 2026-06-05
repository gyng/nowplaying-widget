// Inserting a built-in template directly onto the canvas (the Add-panel "Templates" palette). Driven
// through the hook like previewTemplate.test.ts, since the reducer is internal to useEditorModel.
import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useEditorModel } from './useEditorModel';
import { isGroup, isLeaf } from '../../core/layoutTree';

const CLOCK = 'clock-jp'; // a built-in template id

describe('insertTemplate', () => {
	it('drops a template onto the canvas as a self-contained group (no library def)', () => {
		const { result } = renderHook(() => useEditorModel(true, []));
		act(() => result.current.handleOp({ op: 'insertTemplate', templateId: CLOCK }));

		const s = result.current.state;
		const children = s.monitor.root.children;
		expect(children).toHaveLength(1);
		const node = children[0];
		if (!isLeaf(node) || !isGroup(node.unit)) throw new Error('expected a group leaf');
		expect(node.unit.name).toBe('Clock (JP weekday)');
		expect(node.unit.def).toBeUndefined(); // inline, not a library reference
		expect(node.unit.child).not.toBeNull();
		expect(s.library?.defs ?? []).toHaveLength(0); // library untouched
		expect(s.selectedId).toBe(node.id); // the new group is selected
	});

	it('gives each insert fresh, non-colliding ids', () => {
		const { result } = renderHook(() => useEditorModel(true, []));
		act(() => result.current.handleOp({ op: 'insertTemplate', templateId: CLOCK }));
		act(() => result.current.handleOp({ op: 'insertTemplate', templateId: CLOCK }));
		const ids = result.current.state.monitor.root.children.map((c) => c.id);
		expect(ids).toHaveLength(2);
		expect(new Set(ids).size).toBe(2);
	});
});
