import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import Sparkline from './Sparkline';

const barWidths = (c: Element) =>
	[...c.querySelectorAll('rect[data-part="bar"]')].map((r) => Number(r.getAttribute('width')));

describe('Sparkline histogram', () => {
	it('bars carry a standard margin by default (barGap 0.2 → 40-wide bars in two 50-wide slots)', () => {
		const { container } = render(
			<Sparkline history={[10, 20]} histogram min={0} max={100} seconds={2} />
		);
		expect(barWidths(container)).toEqual([40, 40]);
	});

	it('barGap 0 makes the bars touch (50-wide, sharing an edge)', () => {
		const { container } = render(
			<Sparkline history={[10, 20]} histogram min={0} max={100} seconds={2} barGap={0} />
		);
		const bars = [...container.querySelectorAll('rect[data-part="bar"]')];
		expect(barWidths(container)).toEqual([50, 50]);
		const x0 = Number(bars[0].getAttribute('x'));
		const x1 = Number(bars[1].getAttribute('x'));
		expect(x0 + 50).toBeCloseTo(x1);
	});

	it('draws a baseline axis line by default, and omits it when axis=false', () => {
		const { container, rerender } = render(
			<Sparkline history={[10, 20]} histogram min={0} max={100} seconds={2} />
		);
		expect(container.querySelector('rect[data-part="axis"]')).not.toBeNull();
		rerender(<Sparkline history={[10, 20]} histogram min={0} max={100} seconds={2} axis={false} />);
		expect(container.querySelector('rect[data-part="axis"]')).toBeNull();
	});

	it('line mode draws a polyline and no bars/axis', () => {
		const { container } = render(
			<Sparkline history={[10, 20, 30]} min={0} max={100} seconds={3} />
		);
		expect(container.querySelectorAll('rect').length).toBe(0);
		expect(container.querySelector('polyline')).not.toBeNull();
	});
});
