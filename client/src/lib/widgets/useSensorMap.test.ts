import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { createTelemetryHub } from '../core/telemetry';
import { useSensorMap } from './useSensorMap';

describe('useSensorMap', () => {
	it('maps each NAME to its sensor state and tracks new samples', () => {
		const hub = createTelemetryHub();
		const { result } = renderHook(() =>
			useSensorMap(hub, { price: 'stocks.AAPL.price', currency: 'stocks.AAPL.currency' })
		);
		expect(result.current.price.value).toBeNull();

		act(() => {
			hub.ingest({ sensor: 'stocks.AAPL.price', ts_ms: 0, value: { kind: 'scalar', value: 110 } });
			hub.ingest({
				sensor: 'stocks.AAPL.currency',
				ts_ms: 0,
				value: { kind: 'text', value: 'USD' }
			});
		});
		expect(result.current.price.value).toEqual({ kind: 'scalar', value: 110 });
		expect(result.current.price.history).toEqual([110]);
		expect(result.current.currency.value).toEqual({ kind: 'text', value: 'USD' });
	});

	it('returns a stable EMPTY map for an undefined/empty id map', () => {
		const hub = createTelemetryHub();
		const a = renderHook(() => useSensorMap(hub, undefined));
		const b = renderHook(() => useSensorMap(hub, {}));
		expect(a.result.current).toBe(b.result.current); // the shared frozen EMPTY
	});

	it('keeps the snapshot reference stable until a subscribed sensor emits', () => {
		const hub = createTelemetryHub();
		const { result, rerender } = renderHook(
			({ ids }: { ids: Record<string, string> }) => useSensorMap(hub, ids),
			{ initialProps: { ids: { v: 'cpu.total' } } }
		);
		const first = result.current;
		rerender({ ids: { v: 'cpu.total' } }); // fresh-but-equal map → no resubscribe, same snapshot
		expect(result.current).toBe(first);

		act(() => hub.ingest({ sensor: 'other', ts_ms: 0, value: { kind: 'scalar', value: 1 } }));
		expect(result.current).toBe(first); // an unsubscribed sensor doesn't notify us

		act(() => hub.ingest({ sensor: 'cpu.total', ts_ms: 0, value: { kind: 'scalar', value: 5 } }));
		expect(result.current).not.toBe(first);
		expect(result.current.v.value).toEqual({ kind: 'scalar', value: 5 });
	});

	it('rebinds when the id map changes (e.g. the ticker symbol is edited)', () => {
		const hub = createTelemetryHub();
		hub.ingest({ sensor: 'stocks.NVDA.price', ts_ms: 0, value: { kind: 'scalar', value: 9 } });
		const { result, rerender } = renderHook(
			({ ids }: { ids: Record<string, string> }) => useSensorMap(hub, ids),
			{ initialProps: { ids: { price: 'stocks.AAPL.price' } } }
		);
		expect(result.current.price.value).toBeNull();
		rerender({ ids: { price: 'stocks.NVDA.price' } });
		expect(result.current.price.value).toEqual({ kind: 'scalar', value: 9 });
	});
});
