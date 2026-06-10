// Inserting a built-in template directly onto the canvas (the Add-panel "Templates" palette) and
// cloning one into the library (newFromTemplate). Driven through the hook like
// previewTemplate.test.ts, since the reducer is internal to useEditorModel.
import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useEditorModel } from './useEditorModel';
import {
	isContainer,
	isGroup,
	isLeaf,
	type LayoutNode,
	type WidgetInstance
} from '../../core/layoutTree';
import { getTemplate } from '../../core/templates';

const CLOCK = 'clock-jp'; // a built-in template id

// The clock instance with the given format inside a tree (the time leaf), if any.
function findFormat(node: LayoutNode, format: string): WidgetInstance | undefined {
	if (isContainer(node)) {
		for (const c of node.children) {
			const hit = findFormat(c, format);
			if (hit) return hit;
		}
		return undefined;
	}
	if (isGroup(node.unit)) return node.unit.child ? findFormat(node.unit.child, format) : undefined;
	return node.unit.config?.format === format ? node.unit : undefined;
}

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

	it('applies the picked options through the unified ParamSpec path (12-hour time)', () => {
		const { result } = renderHook(() => useEditorModel(true, []));
		act(() =>
			result.current.handleOp({
				op: 'insertTemplate',
				templateId: CLOCK,
				options: { time: 'h:mm A' }
			})
		);
		const node = result.current.state.monitor.root.children[0];
		expect(findFormat(node, 'h:mm A'), 'time clock carries the chosen format').toBeTruthy();
	});
});

describe('newFromTemplate (clone into the library)', () => {
	it('produces a WidgetDef that KEEPS the template options as ParamSpecs (no longer dropped)', () => {
		const { result } = renderHook(() => useEditorModel(true, []));
		act(() => result.current.dispatch({ type: 'newFromTemplate', templateId: CLOCK }));

		const s = result.current.state;
		const def = s.library?.defs[0];
		expect(def?.name).toBe('Clock (JP weekday)');
		// The cloned def carries the SAME spec the template exposes at insert time — so an instance
		// can still switch 12/24-hour via group params (resolveGroup applies them onto the clone).
		const tpl = getTemplate(CLOCK);
		expect(def?.params).toEqual(tpl?.params);
		// …as a copy, not a shared reference into the built-in template definition.
		expect(def?.params).not.toBe(tpl?.params);
		// The def child has the defaults baked, with the params' index targets resolving against it.
		expect(def && findFormat(def.child, 'HHmm'), 'defaults baked into the child').toBeTruthy();
	});
});
