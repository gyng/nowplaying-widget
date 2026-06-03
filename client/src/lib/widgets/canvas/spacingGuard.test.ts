import { describe, it, expect } from 'vitest';
import { maxPad, maxGap, clampSpacing, clampTreeSpacing } from './spacingGuard';
import { container, leaf, type Container } from '../../core/layoutTree';

describe('spacingGuard', () => {
	describe('maxPad', () => {
		it('caps pad to a quarter of the smaller axis (leaves content usable, not collapsed)', () => {
			// The reported widget-designer case: a 166×98 def. pad 111 collapsed it; the cap is 24,
			// which leaves ~50px of content along the short axis (half the box) — visible, droppable.
			expect(maxPad({ w: 166, h: 98 })).toBe(24); // floor(98 / 4)
		});

		it('is relative to the box, so a full-monitor root still allows large pads', () => {
			expect(maxPad({ w: 2560, h: 1440 })).toBe(360); // floor(1440 / 4)
		});

		it('returns undefined when the box is unknown / not yet solved', () => {
			expect(maxPad(null)).toBeUndefined();
			expect(maxPad(undefined)).toBeUndefined();
			expect(maxPad({ w: 0, h: 0 })).toBeUndefined();
		});

		it('never goes negative for a tiny box', () => {
			expect(maxPad({ w: 2, h: 2 })).toBe(0);
		});
	});

	describe('maxGap', () => {
		it('caps gap at half the smaller axis', () => {
			expect(maxGap({ w: 166, h: 98 })).toBe(49);
		});

		it('returns undefined for an unknown box', () => {
			expect(maxGap(null)).toBeUndefined();
		});
	});

	describe('clampSpacing', () => {
		it('clamps an over-large value down to max', () => {
			expect(clampSpacing(111, 24)).toBe(24);
		});

		it('passes through a value within range', () => {
			expect(clampSpacing(8, 24)).toBe(8);
		});

		it('floors at 0 (no negative pad/gap)', () => {
			expect(clampSpacing(-5, 24)).toBe(0);
		});

		it('treats a non-finite (empty field) value as 0', () => {
			expect(clampSpacing(NaN, 24)).toBe(0);
		});

		it('only floors at 0 when no max is known', () => {
			expect(clampSpacing(111, undefined)).toBe(111);
			expect(clampSpacing(-2, undefined)).toBe(0);
		});
	});

	describe('clampTreeSpacing', () => {
		const canvas = { w: 166, h: 98 };

		it('heals an over-padded root (the saved clock-def case) to a usable pad/gap', () => {
			const root = container('root', 'col', [], { pad: 111, gap: 60, align: 'stretch' });
			const out = clampTreeSpacing(root, canvas) as Container;
			expect(out.pad).toBe(24); // 111 → maxPad
			expect(out.gap).toBe(49); // 60 → maxGap
		});

		it('clamps nested containers too', () => {
			const root = container(
				'root',
				'col',
				[container('inner', 'col', [], { pad: 200, align: 'stretch' })],
				{ align: 'stretch' }
			);
			const out = clampTreeSpacing(root, canvas) as Container;
			expect((out.children[0] as Container).pad).toBe(24);
		});

		it('clamps each side of an object pad', () => {
			const root = container('root', 'col', [], { pad: { t: 200, r: 4, b: 200, l: 4 } });
			const out = clampTreeSpacing(root, canvas) as Container;
			expect(out.pad).toEqual({ t: 24, r: 4, b: 24, l: 4 });
		});

		it('returns the SAME reference when nothing exceeds the cap (no spurious dirtying)', () => {
			const root = container(
				'root',
				'col',
				[leaf({ id: 'w', type: 'clock', rect: { x: 0, y: 0, w: 10, h: 10 }, config: {} })],
				{
					pad: 8,
					gap: 4,
					align: 'stretch'
				}
			);
			expect(clampTreeSpacing(root, canvas)).toBe(root);
		});
	});
});
