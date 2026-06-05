import { describe, expect, it } from 'vitest';
import { freqLabel, groupBands, magnitudeColor, pipPositions, spectrumBars } from './spectrumMath';

describe('groupBands', () => {
	it('passes bands through unchanged when count >= length', () => {
		expect(groupBands([0.1, 0.2, 0.3], 3)).toEqual([0.1, 0.2, 0.3]);
		expect(groupBands([0.1, 0.2], 8)).toEqual([0.1, 0.2]);
	});

	it('max-pools adjacent bands into the requested number of groups', () => {
		// 4 bands → 2 groups: max(0.1,0.9)=0.9, max(0.3,0.2)=0.3.
		expect(groupBands([0.1, 0.9, 0.3, 0.2], 2)).toEqual([0.9, 0.3]);
	});

	it('handles degenerate inputs', () => {
		expect(groupBands([], 4)).toEqual([]);
		expect(groupBands([0.5], 0)).toEqual([]);
	});
});

describe('spectrumBars', () => {
	it('produces one bar per band rising from the baseline', () => {
		const bars = spectrumBars([0, 0.5, 1], 30, 100, 0);
		expect(bars).toHaveLength(3);
		// gap 0 → full slot width (30 / 3 = 10).
		expect(bars[0].w).toBeCloseTo(10);
		// Heights are magnitude × height; y is inverted (baseline at height).
		expect(bars[0].h).toBeCloseTo(0);
		expect(bars[0].y).toBeCloseTo(100);
		expect(bars[1].h).toBeCloseTo(50);
		expect(bars[1].y).toBeCloseTo(50);
		expect(bars[2].h).toBeCloseTo(100);
		expect(bars[2].y).toBeCloseTo(0);
	});

	it('applies the fractional gap and clamps out-of-range values', () => {
		const bars = spectrumBars([2, -1], 20, 50, 0.2);
		// slot = 10, gap 0.2 → bar width 8, centred in the slot.
		expect(bars[0].w).toBeCloseTo(8);
		expect(bars[0].x).toBeCloseTo(1);
		// value 2 clamps to 1 → full height; -1 clamps to 0 → empty.
		expect(bars[0].h).toBeCloseTo(50);
		expect(bars[1].h).toBeCloseTo(0);
	});

	it('returns nothing for empty bands or zero-size canvas', () => {
		expect(spectrumBars([], 100, 100)).toEqual([]);
		expect(spectrumBars([0.5], 0, 100)).toEqual([]);
		expect(spectrumBars([0.5], 100, 0)).toEqual([]);
	});
});

describe('freqLabel', () => {
	it('formats Hz and kHz compactly', () => {
		expect(freqLabel(100)).toBe('100');
		expect(freqLabel(1000)).toBe('1k');
		expect(freqLabel(1500)).toBe('1.5k');
		expect(freqLabel(10000)).toBe('10k');
	});
});

describe('pipPositions', () => {
	it('maps endpoints to 0 and 1 and stays monotonic (log)', () => {
		const pips = pipPositions([30, 16000], 30, 16000, false);
		expect(pips).toHaveLength(2);
		expect(pips[0].frac).toBeCloseTo(0);
		expect(pips[1].frac).toBeCloseTo(1);
		// 1 kHz sits past the midpoint on a log axis spanning 30..16000.
		const [k] = pipPositions([1000], 30, 16000, false);
		expect(k.frac).toBeGreaterThan(0.4);
		expect(k.frac).toBeLessThan(0.7);
		expect(k.label).toBe('1k');
	});

	it('spaces linearly when linear=true', () => {
		const [mid] = pipPositions([8015], 30, 16000, true); // ~midpoint of 30..16000
		expect(mid.frac).toBeCloseTo(0.5, 1);
	});

	it('drops frequencies outside the range and handles a bad range', () => {
		expect(pipPositions([10, 20000], 30, 16000, false)).toEqual([]);
		expect(pipPositions([1000], 16000, 30, false)).toEqual([]);
	});
});

describe('magnitudeColor', () => {
	it('maps the endpoints to the dark floor and the hot top', () => {
		expect(magnitudeColor(0)).toEqual([10, 12, 30]);
		expect(magnitudeColor(1)).toEqual([240, 80, 60]);
		// Out-of-range clamps.
		expect(magnitudeColor(-5)).toEqual([10, 12, 30]);
		expect(magnitudeColor(5)).toEqual([240, 80, 60]);
	});

	it('interpolates between stops', () => {
		// Exactly on a stop returns that stop's colour.
		expect(magnitudeColor(0.5)).toEqual([40, 170, 160]);
		// Between stops the channels lie strictly between the neighbours.
		const mid = magnitudeColor(0.125);
		expect(mid[0]).toBeGreaterThan(10);
		expect(mid[0]).toBeLessThan(30);
	});
});
