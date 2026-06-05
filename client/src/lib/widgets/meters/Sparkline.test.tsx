import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import Sparkline from './Sparkline';

const widthsOf = (c: Element) =>
	[...c.querySelectorAll('rect')].map((r) => Number(r.getAttribute('width')));

describe('Sparkline histogram bar gap', () => {
	it('bars TOUCH by default — two slots of width 50 across the 100-wide viewBox, no gap', () => {
		const { container } = render(
			<Sparkline history={[10, 20]} histogram min={0} max={100} seconds={2} />
		);
		const rects = [...container.querySelectorAll('rect')];
		expect(rects).toHaveLength(2);
		expect(widthsOf(container)).toEqual([50, 50]);
		// adjacent bars share an edge (bar0.x + width === bar1.x)
		const x0 = Number(rects[0].getAttribute('x'));
		const x1 = Number(rects[1].getAttribute('x'));
		expect(x0 + 50).toBeCloseTo(x1);
	});

	it('a barGap reintroduces space between bars (40-wide bars at gap 0.2)', () => {
		const { container } = render(
			<Sparkline history={[10, 20]} histogram min={0} max={100} seconds={2} barGap={0.2} />
		);
		expect(widthsOf(container)).toEqual([40, 40]);
	});
});
