// The template-preview lifecycle (read-only preview → clone, or discard) lives in the reducer. We
// can't import the reducer directly (it's internal to the hook), so drive it through renderHook,
// which is also the closest thing to how the Canvas uses it.
import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useEditorModel } from './useEditorModel';

const CLOCK = 'clock-jp'; // a built-in template id

describe('template preview lifecycle', () => {
	it('previews a template WITHOUT cloning it into the library', () => {
		const { result } = renderHook(() => useEditorModel(true, []));
		act(() => result.current.dispatch({ type: 'previewTemplate', templateId: CLOCK }));

		const s = result.current.state;
		expect(s.previewDef).not.toBeNull();
		expect(s.previewDef?.name).toBe('Clock (JP weekday)');
		expect(s.editingDefId).toBe(s.previewDef?.id); // canvas sizes to the preview
		// The library is untouched — preview must not add a widget.
		expect(s.library?.defs ?? []).toHaveLength(0);
		// The real layout is stashed; the scoped monitor holds the template.
		expect(s.savedMonitor).not.toBeNull();
	});

	it('discards the preview on endPreview (library still empty, real monitor restored)', () => {
		const { result } = renderHook(() => useEditorModel(true, []));
		const realMonitor = result.current.state.monitor;
		act(() => result.current.dispatch({ type: 'previewTemplate', templateId: CLOCK }));
		act(() => result.current.dispatch({ type: 'endPreview' }));

		const s = result.current.state;
		expect(s.previewDef).toBeNull();
		expect(s.editingDefId).toBeNull();
		expect(s.savedMonitor).toBeNull();
		expect(s.monitor).toBe(realMonitor);
		expect(s.library?.defs ?? []).toHaveLength(0);
	});

	it('clonePreview promotes the previewed template into the library and keeps editing it', () => {
		const { result } = renderHook(() => useEditorModel(true, []));
		act(() => result.current.dispatch({ type: 'previewTemplate', templateId: CLOCK }));
		const previewId = result.current.state.previewDef?.id;
		act(() => result.current.dispatch({ type: 'clonePreview' }));

		const s = result.current.state;
		expect(s.previewDef).toBeNull(); // no longer a preview
		expect(s.editingDefId).toBe(previewId); // still editing the same def…
		expect(s.library?.defs.map((d) => d.id)).toContain(previewId); // …now a real library def
	});
});
