import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { createTelemetryHub, type TelemetryHub } from '../../core/telemetry';
import { TelemetryHubContext } from '../telemetryContext';
import Ticker from './Ticker';

type Props = Parameters<typeof Ticker>[0];

function renderTicker(props: Props, seed?: (hub: TelemetryHub) => void) {
	const hub = createTelemetryHub();
	seed?.(hub);
	const view = render(
		<TelemetryHubContext.Provider value={hub}>
			<Ticker {...props} />
		</TelemetryHubContext.Provider>
	);
	return { hub, ...view };
}

const seedAAPL = (hub: TelemetryHub, price = 110, change = 10) => {
	hub.ingest({ sensor: 'stocks.AAPL.price', ts_ms: 1, value: { kind: 'scalar', value: price } });
	hub.ingest({ sensor: 'stocks.AAPL.change', ts_ms: 1, value: { kind: 'scalar', value: change } });
	hub.ingest({ sensor: 'stocks.AAPL.currency', ts_ms: 1, value: { kind: 'text', value: 'USD' } });
	hub.ingest({
		sensor: 'stocks.AAPL.series',
		ts_ms: 1,
		value: { kind: 'series', value: [100, 105, 110] }
	});
};

const part = (c: HTMLElement, p: string) => c.querySelector(`[data-part="${p}"]`);
const root = (c: HTMLElement) => c.querySelector('.np-ticker') as HTMLElement;

describe('Ticker', () => {
	it('shows a placeholder when no symbol is set', () => {
		const { container } = renderTicker({ symbol: '' });
		expect(part(container, 'placeholder')?.textContent).toBe('Set a symbol');
		expect(part(container, 'price')).toBeNull();
	});

	it('renders symbol, currency-prefixed price, and a positive change (dir=up, ▲)', () => {
		const { container } = renderTicker({ symbol: 'aapl' }, (h) => seedAAPL(h));
		expect(part(container, 'symbol')?.textContent).toBe('AAPL');
		expect(part(container, 'price')?.textContent).toBe('$110.00');
		expect(part(container, 'change')?.textContent).toContain('+10.00%');
		expect(part(container, 'arrow')?.textContent).toBe('▲');
		expect(root(container).getAttribute('data-dir')).toBe('up');
	});

	it('colors a loss down (▼) and flags the market state', () => {
		const { container } = renderTicker({ symbol: 'AAPL' }, (h) => {
			seedAAPL(h, 90, -10);
			h.ingest({ sensor: 'stocks.AAPL.state', ts_ms: 1, value: { kind: 'text', value: 'CLOSED' } });
		});
		expect(root(container).getAttribute('data-dir')).toBe('down');
		expect(part(container, 'arrow')?.textContent).toBe('▼');
		expect(part(container, 'state')?.textContent).toBe('closed');
	});

	it('reflects the invert-colours toggle as data-invert (CSS swaps up/down)', () => {
		const off = renderTicker({ symbol: 'AAPL' }, (h) => seedAAPL(h));
		expect(root(off.container).getAttribute('data-invert')).toBe('false');
		const on = renderTicker({ symbol: 'AAPL', invertColors: true }, (h) => seedAAPL(h));
		expect(root(on.container).getAttribute('data-invert')).toBe('true');
		// dir is still 'up' for a gain — only the colour mapping flips, in CSS.
		expect(root(on.container).getAttribute('data-dir')).toBe('up');
	});

	it('uses the label override for the header', () => {
		const { container } = renderTicker({ symbol: 'AAPL', label: 'Apple' }, (h) => seedAAPL(h));
		expect(part(container, 'symbol')?.textContent).toBe('Apple');
	});

	it('shows a loading dash before the first price', () => {
		const { container } = renderTicker({ symbol: 'AAPL' }); // no samples
		expect(part(container, 'price')?.textContent).toBe('…');
		expect(root(container).getAttribute('data-loading')).toBe('true');
	});

	it('renders the sparkline from the series, and hides it when disabled', () => {
		const on = renderTicker({ symbol: 'AAPL', showSparkline: true }, (h) => seedAAPL(h));
		expect(on.container.querySelector('.np-ticker-spark svg')).not.toBeNull();
		const off = renderTicker({ symbol: 'AAPL', showSparkline: false }, (h) => seedAAPL(h));
		expect(off.container.querySelector('.np-ticker-spark')).toBeNull();
	});
});
