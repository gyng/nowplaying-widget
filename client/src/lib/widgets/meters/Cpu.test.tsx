import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import Cpu from './Cpu';
import { TelemetryHubContext } from '../telemetryContext';
import { createTelemetryHub, type SensorSample, type TelemetryHub } from '../../core/telemetry';

// A hub seeded with cpu.total + `coreCount` per-core sensors, two ticks each so every core has
// enough history to draw a <polyline>. When `withFreq` is set it also emits the per-core FREQUENCY
// sensors (cpu.core.N.freq, MHz) the studio's "*" subscription broadcasts — they must NOT show up.
function hubWith(coreCount: number, withFreq = false): TelemetryHub {
	const hub = createTelemetryHub();
	for (let t = 0; t < 2; t++) {
		const batch: SensorSample[] = [
			{ sensor: 'cpu.total', ts_ms: t, value: { kind: 'scalar', value: 10 } }
		];
		for (let i = 0; i < coreCount; i++) {
			batch.push({ sensor: `cpu.core.${i}`, ts_ms: t, value: { kind: 'scalar', value: 10 + i } });
			if (withFreq) {
				batch.push({ sensor: `cpu.core.${i}.freq`, ts_ms: t, value: { kind: 'scalar', value: 4000 } });
			}
		}
		hub.ingestBatch(batch);
	}
	return hub;
}

function renderCpu(node: ReactElement, coreCount: number, withFreq = false) {
	return render(
		<TelemetryHubContext.Provider value={hubWith(coreCount, withFreq)}>
			{node}
		</TelemetryHubContext.Provider>
	);
}

describe('Cpu (per-core grid)', () => {
	it('renders one sparkline per core', () => {
		const { container } = renderCpu(<Cpu />, 32);
		expect(container.querySelectorAll('.np-sparkline').length).toBe(32);
	});

	it('defaults to one column per core — a single row spanning every core', () => {
		const { container } = renderCpu(<Cpu />, 32);
		const grid = container.querySelector('.np-cpu-cores') as HTMLElement;
		expect(grid.style.gridTemplateColumns).toBe('repeat(32, 1fr)');
	});

	it('ignores per-core frequency sensors (cpu.core.N.freq) — usage only', () => {
		// 32 usage + 32 freq present (as when the studio "*" subscription is live); the grid must
		// stay at exactly the 32 usage cores, not pad out with 32 blank off-scale freq sparklines.
		const { container } = renderCpu(<Cpu />, 32, true);
		expect(container.querySelectorAll('.np-sparkline').length).toBe(32);
		const grid = container.querySelector('.np-cpu-cores') as HTMLElement;
		expect(grid.style.gridTemplateColumns).toBe('repeat(32, 1fr)');
	});

	it('respects an explicit cols override (a fixed-width grid)', () => {
		const { container } = renderCpu(<Cpu cols={4} />, 32);
		const grid = container.querySelector('.np-cpu-cores') as HTMLElement;
		expect(grid.style.gridTemplateColumns).toBe('repeat(4, 1fr)');
	});

	it('draws the core lines white by default (no accent tint)', () => {
		const { container } = renderCpu(<Cpu />, 4);
		const line = container.querySelector('polyline') as SVGElement;
		expect(line.style.stroke).toBe('rgb(255, 255, 255)');
	});

	it('lets an explicit color override the white default', () => {
		const { container } = renderCpu(<Cpu color="red" />, 4);
		const line = container.querySelector('polyline') as SVGElement;
		expect(line.style.stroke).toBe('red');
	});
});
