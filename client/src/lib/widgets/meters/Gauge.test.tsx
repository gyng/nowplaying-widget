import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import Gauge from './Gauge';

// The Gauge's geometry constants (SIZE 100, STROKE 9) and the legacy 270° sweep fraction.
const R = (100 - 9) / 2;
const C = 2 * Math.PI * R;
const SWEEP = 0.75;

const part = (c: Element, p: string) => {
	const el = c.querySelector(`[data-part="${p}"]`);
	if (!el) throw new Error(`missing data-part="${p}"`);
	return el;
};
const parts = (c: Element, p: string) => [...c.querySelectorAll(`[data-part="${p}"]`)];

describe('Gauge (arc, the default)', () => {
	it('renders the legacy 270° arc structure when style is absent', () => {
		const { container } = render(<Gauge value={42} label="CPU" />);
		expect(container.querySelector('g')?.getAttribute('transform')).toBe('rotate(135 50 50)');
		const track = part(container, 'track');
		const fill = part(container, 'fill');
		expect(track.getAttribute('stroke-dasharray')).toBe(`${SWEEP * C} ${C}`);
		expect(fill.getAttribute('stroke-dasharray')).toBe(`${0.42 * SWEEP * C} ${C}`);
		expect(track.getAttribute('stroke-linecap')).toBe('round');
		expect(fill.getAttribute('stroke-linecap')).toBe('round');
		expect(part(container, 'value').textContent).toBe('42%');
		expect(part(container, 'unit').textContent).toBe('%');
		expect(part(container, 'label').textContent).toBe('CPU');
	});

	it("style='arc' renders DOM identical to no style at all", () => {
		const legacy = render(<Gauge value={42} label="CPU" />).container.innerHTML;
		const arc = render(<Gauge value={42} label="CPU" style="arc" />).container.innerHTML;
		expect(arc).toBe(legacy);
	});

	it('sweep=180 halves the track and re-centres the gap (rotate(180))', () => {
		const { container } = render(<Gauge value={50} label="CPU" sweep={180} />);
		expect(container.querySelector('g')?.getAttribute('transform')).toBe('rotate(180 50 50)');
		expect(part(container, 'track').getAttribute('stroke-dasharray')).toBe(`${0.5 * C} ${C}`);
	});
});

describe('Gauge style=circle', () => {
	it('renders a full ring (no gap, butt caps) with the centered value/label', () => {
		const { container } = render(<Gauge value={50} label="GPU" style="circle" />);
		expect(container.querySelector('g')?.getAttribute('transform')).toBe('rotate(-90 50 50)');
		const track = part(container, 'track');
		const fill = part(container, 'fill');
		expect(track.getAttribute('stroke-dasharray')).toBeNull(); // a closed ring
		expect(fill.getAttribute('stroke-dasharray')).toBe(`${0.5 * C} ${C}`);
		expect(fill.getAttribute('stroke-linecap')).toBe('butt');
		expect(part(container, 'value').textContent).toBe('50%');
		expect(part(container, 'label').textContent).toBe('GPU');
	});
});

describe('Gauge style=pips', () => {
	it('arc direction lights round(frac×N) dots in accent, the rest as track', () => {
		const { container } = render(<Gauge value={50} label="CPU" style="pips" pips={10} />);
		expect(parts(container, 'fill')).toHaveLength(5);
		expect(parts(container, 'track')).toHaveLength(5);
		expect(parts(container, 'fill').every((e) => e.tagName === 'circle')).toBe(true);
		expect(part(container, 'value').textContent).toBe('50%');
		expect(part(container, 'label').textContent).toBe('CPU');
	});

	it('ltr lays SVG segments left → right (filled segments leftmost)', () => {
		const { container } = render(<Gauge value={50} style="pips" pips={4} direction="ltr" />);
		const fills = parts(container, 'fill');
		const tracks = parts(container, 'track');
		expect(fills).toHaveLength(2);
		expect(tracks).toHaveLength(2);
		expect(fills.every((e) => e.tagName === 'rect')).toBe(true);
		const maxFillX = Math.max(...fills.map((e) => Number(e.getAttribute('x'))));
		const minTrackX = Math.min(...tracks.map((e) => Number(e.getAttribute('x'))));
		expect(maxFillX).toBeLessThan(minTrackX);
		expect(part(container, 'value').textContent).toBe('50%');
	});

	it('rtl puts the filled segments at the right edge', () => {
		const { container } = render(<Gauge value={25} style="pips" pips={4} direction="rtl" />);
		const fillX = Number(part(container, 'fill').getAttribute('x'));
		const trackXs = parts(container, 'track').map((e) => Number(e.getAttribute('x')));
		expect(trackXs.every((x) => x < fillX)).toBe(true);
	});
});

describe('Gauge style=linear', () => {
	it('horizontal: label left, growing bar, value right; fill width tracks frac', () => {
		const { container } = render(<Gauge value={50} label="MEM" style="linear" direction="ltr" />);
		expect(container.querySelector('.np-gauge-linear')?.getAttribute('data-dir')).toBe('ltr');
		expect(part(container, 'label').textContent).toBe('MEM');
		expect(part(container, 'value').textContent).toBe('50%');
		expect(part(container, 'unit').textContent).toBe('%');
		expect(part(container, 'track')).not.toBeNull();
		expect((part(container, 'fill') as HTMLElement).style.width).toBe('50%');
	});

	it('vertical (btt): the fill is a height percentage', () => {
		const { container } = render(<Gauge value={25} label="MEM" style="linear" direction="btt" />);
		expect(container.querySelector('.np-gauge-linear')?.getAttribute('data-dir')).toBe('btt');
		expect((part(container, 'fill') as HTMLElement).style.height).toBe('25%');
		expect(part(container, 'value').textContent).toBe('25%');
	});

	it("defaults to ltr when direction is the gauge default 'arc'", () => {
		const { container } = render(<Gauge value={10} style="linear" />);
		expect(container.querySelector('.np-gauge-linear')?.getAttribute('data-dir')).toBe('ltr');
		expect((part(container, 'fill') as HTMLElement).style.width).toBe('10%');
	});
});

describe('Gauge style=needle', () => {
	it('draws track ticks, an accent needle rotated to frac, a hub and the value/label', () => {
		const { container } = render(<Gauge value={50} label="CPU" style="needle" />);
		const ticks = parts(container, 'track');
		expect(ticks).toHaveLength(10); // 270° → one tick per 30°, ends inclusive
		expect(ticks.every((e) => e.tagName === 'line')).toBe(true);
		const needle = part(container, 'fill');
		expect(needle.tagName).toBe('line');
		expect(needle.getAttribute('transform')).toBe('rotate(270 50 50)'); // 50% → straight up
		expect(part(container, 'hub')).not.toBeNull();
		expect(part(container, 'value').textContent).toBe('50%');
		expect(part(container, 'label').textContent).toBe('CPU');
	});
});
