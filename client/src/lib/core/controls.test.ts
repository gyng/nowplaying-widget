import { afterEach, describe, expect, it } from 'vitest';
import {
	chordMatches,
	clearControls,
	deriveHints,
	detectConflicts,
	formatTrigger,
	getControl,
	listControls,
	matchKeyChord,
	matchPointer,
	matchWheel,
	mergeOverrides,
	parseControlOverrides,
	parseKeyEvent,
	registerControl,
	type Control,
	type ControlContext,
	type Trigger
} from './controls';

const baseCtx: ControlContext = {
	scope: 'studio',
	studio: true,
	editMode: true,
	menuOpen: false,
	dirty: false,
	hasSelection: false,
	spaceDown: false,
	panning: false,
	previewing: false
};

const ctrl = (over: Partial<Control> & Pick<Control, 'id' | 'triggers'>): Control => ({
	scope: 'studio',
	group: 'edit',
	label: over.id,
	...over
});

afterEach(() => clearControls());

describe('parseKeyEvent', () => {
	it('lowercases key, keeps code, captures all modifiers', () => {
		expect(
			parseKeyEvent({
				key: 'S',
				code: 'KeyS',
				ctrlKey: true,
				shiftKey: false,
				altKey: false,
				metaKey: false
			})
		).toEqual({ key: 's', code: 'KeyS', ctrl: true, shift: false, alt: false, meta: false });
	});
});

describe('chordMatches', () => {
	const chord = (o: Partial<ReturnType<typeof parseKeyEvent>>) => ({
		key: '',
		code: '',
		ctrl: false,
		shift: false,
		alt: false,
		meta: false,
		...o
	});

	it('is modifier-exact: an omitted modifier must be up', () => {
		// undo trigger (Ctrl+Z, shift implicitly up) must NOT match Ctrl+Shift+Z (that is redo)
		expect(chordMatches({ key: 'z', ctrl: true }, chord({ key: 'z', ctrl: true }))).toBe(true);
		expect(
			chordMatches({ key: 'z', ctrl: true }, chord({ key: 'z', ctrl: true, shift: true }))
		).toBe(false);
	});

	it('matches by code when present (Space), ignoring key', () => {
		expect(chordMatches({ code: 'Space' }, chord({ code: 'Space', key: ' ' }))).toBe(true);
		expect(chordMatches({ code: 'Space' }, chord({ code: 'KeyA', key: 'a' }))).toBe(false);
	});
});

describe('matchKeyChord', () => {
	it('returns the first enabled control whose key trigger matches', () => {
		const save = ctrl({
			id: 'save',
			triggers: [{ type: 'key', key: 's', ctrl: true }],
			when: (c) => c.dirty
		});
		const undo = ctrl({ id: 'undo', triggers: [{ type: 'key', key: 'z', ctrl: true }] });
		const controls = [save, undo];
		const chord = parseKeyEvent({
			key: 's',
			code: 'KeyS',
			ctrlKey: true,
			shiftKey: false,
			altKey: false,
			metaKey: false
		});
		// when=dirty fails → save skipped → no match
		expect(matchKeyChord(chord, controls, baseCtx)).toBeNull();
		// dirty → save matches
		expect(matchKeyChord(chord, controls, { ...baseCtx, dirty: true })?.id).toBe('save');
	});
});

describe('matchPointer', () => {
	const pan = ctrl({
		id: 'pan',
		group: 'view',
		triggers: [
			{ type: 'pointer', button: 'middle', kind: 'drag', target: 'any' },
			{ type: 'pointer', button: 'left', kind: 'drag', target: 'any', spaceHeld: true }
		]
	});
	const marquee = ctrl({
		id: 'marquee',
		triggers: [{ type: 'pointer', button: 'left', kind: 'drag', target: 'canvas' }]
	});
	const controls = [pan, marquee];

	it('middle-drag and Space+left-drag both match pan; plain left-drag on canvas is marquee', () => {
		expect(
			matchPointer({ button: 'middle', kind: 'drag', target: 'canvas' }, controls, baseCtx)?.id
		).toBe('pan');
		expect(
			matchPointer(
				{ button: 'left', kind: 'drag', target: 'canvas', spaceHeld: true },
				controls,
				baseCtx
			)?.id
		).toBe('pan');
		expect(
			matchPointer({ button: 'left', kind: 'drag', target: 'canvas' }, controls, baseCtx)?.id
		).toBe('marquee');
	});

	it('a widget-target drag does not match a canvas-target trigger', () => {
		expect(
			matchPointer({ button: 'left', kind: 'drag', target: 'widget' }, controls, baseCtx)
		).toBeNull();
	});
});

describe('matchWheel', () => {
	it('matches a plain wheel zoom control', () => {
		const zoom = ctrl({ id: 'zoom', group: 'view', triggers: [{ type: 'wheel' }] });
		expect(matchWheel({ ctrl: false, shift: false, alt: false }, [zoom], baseCtx)?.id).toBe('zoom');
		expect(matchWheel({ ctrl: true, shift: false, alt: false }, [zoom], baseCtx)).toBeNull();
	});
});

describe('mergeOverrides', () => {
	const save = ctrl({ id: 'save', triggers: [{ type: 'key', key: 's', ctrl: true }] });
	const del = ctrl({ id: 'del', triggers: [{ type: 'key', key: 'delete' }] });

	it('replaces triggers, drops disabled, ignores unknown ids', () => {
		const merged = mergeOverrides([save, del], {
			save: { triggers: [{ type: 'key', key: 's', ctrl: true, shift: true }] },
			del: { disabled: true },
			ghost: { disabled: true }
		});
		expect(merged.map((c) => c.id)).toEqual(['save']); // del dropped, ghost ignored
		expect((merged[0].triggers[0] as { shift?: boolean }).shift).toBe(true);
	});
});

describe('parseControlOverrides', () => {
	it('keeps valid overrides and drops malformed ones', () => {
		const obj = {
			version: 1,
			overrides: {
				save: { triggers: [{ type: 'key', key: 's', ctrl: true }] },
				del: { disabled: true },
				bad1: { triggers: 'nope' },
				bad2: 42
			}
		};
		const o = parseControlOverrides(obj);
		expect(Object.keys(o).sort()).toEqual(['del', 'save']);
		expect(o.del.disabled).toBe(true);
	});

	it('returns empty for garbage input', () => {
		expect(parseControlOverrides(null)).toEqual({});
		expect(parseControlOverrides({ nope: true })).toEqual({});
	});
});

describe('formatTrigger', () => {
	const cases: [Trigger, string][] = [
		[{ type: 'key', key: 's', ctrl: true }, 'Ctrl+S'],
		[{ type: 'key', key: 'z', ctrl: true, shift: true }, 'Ctrl+Shift+Z'],
		[{ type: 'key', key: 'escape' }, 'Esc'],
		[{ type: 'key', key: 'delete' }, 'Del'],
		[{ type: 'key', code: 'Space' }, 'Space'],
		[{ type: 'key', key: 'arrowleft' }, '←'],
		[{ type: 'pointer', button: 'middle', kind: 'drag', target: 'any' }, 'Middle-drag'],
		[{ type: 'pointer', button: 'right', kind: 'click', target: 'any' }, 'Right-click'],
		[{ type: 'pointer', button: 'right', kind: 'drag', target: 'widget' }, 'Right-drag'],
		[
			{ type: 'pointer', button: 'left', kind: 'drag', target: 'canvas', shift: true },
			'Shift+Drag'
		],
		[
			{ type: 'pointer', button: 'left', kind: 'drag', target: 'any', spaceHeld: true },
			'Space+Drag'
		],
		[{ type: 'pointer', button: 'left', kind: 'drag', target: 'widget' }, 'Drag'],
		[{ type: 'pointer', button: 'left', kind: 'click', target: 'widget' }, 'Click'],
		[{ type: 'wheel' }, 'Scroll']
	];
	it.each(cases)('formats %j as %s', (trigger, expected) => {
		expect(formatTrigger(trigger)).toBe(expected);
	});
});

describe('deriveHints', () => {
	const controls = (): Control[] => [
		ctrl({
			id: 'move',
			label: 'move',
			triggers: [{ type: 'pointer', button: 'left', kind: 'drag', target: 'widget' }],
			hintOrder: 2
		}),
		ctrl({
			id: 'pan',
			label: 'pan',
			group: 'view',
			triggers: [
				{ type: 'pointer', button: 'middle', kind: 'drag', target: 'any' },
				{ type: 'pointer', button: 'left', kind: 'drag', target: 'any', spaceHeld: true }
			],
			hintOrder: 4,
			hint: (c, ts) => formatTrigger(c.spaceDown ? ts[1] : ts[0])
		}),
		ctrl({
			id: 'marqueeAdd',
			label: 'marquee',
			group: 'selection',
			triggers: [{ type: 'pointer', button: 'left', kind: 'drag', target: 'canvas', shift: true }],
			hintOrder: 5,
			hintWhen: (c) => !c.spaceDown
		}),
		ctrl({
			id: 'nudge',
			label: 'nudge',
			group: 'selection',
			triggers: [{ type: 'key', key: 'arrowleft' }],
			hintOrder: 7,
			hintWhen: (c) => c.hasSelection,
			hint: () => 'Arrows'
		}),
		// not advertised (no hintOrder) — a real control but not bar-worthy
		ctrl({ id: 'save', label: 'save', triggers: [{ type: 'key', key: 's', ctrl: true }] })
	];

	it('advertises only hintOrder controls, sorted; shows Middle-drag for pan (the drift fix)', () => {
		const hints = deriveHints(controls(), baseCtx);
		expect(hints).toEqual([
			{ key: 'Drag', label: 'move' },
			{ key: 'Middle-drag', label: 'pan' },
			{ key: 'Shift+Drag', label: 'marquee' }
		]);
	});

	it('swaps pan to Space+Drag and hides the marquee while Space is held', () => {
		const hints = deriveHints(controls(), { ...baseCtx, spaceDown: true });
		const keys = hints.map((h) => h.key);
		expect(keys).toContain('Space+Drag');
		expect(keys).not.toContain('Shift+Drag');
		expect(keys).not.toContain('Middle-drag');
	});

	it('shows the selection-gated nudge only with a selection', () => {
		expect(deriveHints(controls(), baseCtx).some((h) => h.label === 'nudge')).toBe(false);
		expect(
			deriveHints(controls(), { ...baseCtx, hasSelection: true }).some((h) => h.label === 'nudge')
		).toBe(true);
	});

	it('takes over the bar while panning', () => {
		expect(deriveHints(controls(), { ...baseCtx, panning: true })).toEqual([
			{ key: 'Drag', label: 'panning view' },
			{ key: 'Release', label: 'done' }
		]);
	});
});

describe('detectConflicts', () => {
	it('flags two same-scope controls that share an identical trigger', () => {
		const a = ctrl({ id: 'a', triggers: [{ type: 'key', key: 'x', ctrl: true }] });
		const b = ctrl({ id: 'b', triggers: [{ type: 'key', key: 'x', ctrl: true }] });
		expect(detectConflicts([a, b])).toHaveLength(1);
	});

	it('does not flag different scopes or different pointer targets', () => {
		const a = ctrl({ id: 'a', scope: 'studio', triggers: [{ type: 'key', key: 'x' }] });
		const b = ctrl({ id: 'b', scope: 'widget', triggers: [{ type: 'key', key: 'x' }] });
		const move = ctrl({
			id: 'move',
			triggers: [{ type: 'pointer', button: 'left', kind: 'drag', target: 'widget' }]
		});
		const marquee = ctrl({
			id: 'marquee',
			triggers: [{ type: 'pointer', button: 'left', kind: 'drag', target: 'canvas' }]
		});
		expect(detectConflicts([a, b])).toHaveLength(0);
		expect(detectConflicts([move, marquee])).toHaveLength(0);
	});
});

describe('registry', () => {
	it('registers, lists, gets, and replaces by id', () => {
		registerControl(ctrl({ id: 'one', triggers: [] }));
		registerControl(ctrl({ id: 'one', label: 'replaced', triggers: [] }));
		registerControl(ctrl({ id: 'two', triggers: [] }));
		expect(listControls().map((c) => c.id)).toEqual(['one', 'two']);
		expect(getControl('one')?.label).toBe('replaced');
	});
});
