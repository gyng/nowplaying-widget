import { beforeAll, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render } from '@testing-library/react';
import WidgetHost from './WidgetHost';
import HaSensor from './meters/HaSensor';
import { registerWidget, type MeterComponent } from './registry';
import { createTelemetryHub } from '../core/telemetry';
import type { WidgetInstance } from '../core/layout';

// A binds:'json' widget type for the test (reuses the HA sensor meter as the renderer).
registerWidget(
	{ type: 'test.json', binds: 'json', label: 'T' },
	HaSensor as unknown as MeterComponent
);

describe('WidgetHost binds-driven value passing', () => {
	it('forwards the raw JSON SensorValue payload to a binds:json meter', () => {
		const hub = createTelemetryHub();
		const instance: WidgetInstance = {
			id: 'w1',
			type: 'test.json',
			sensor: 'x',
			rect: { x: 0, y: 0, w: 150, h: 44 },
			config: {}
		};
		const { getByText } = render(<WidgetHost hub={hub} instance={instance} editMode={false} />);

		// ingest happens OUTSIDE React's render — wrap in act() so the useSyncExternalStore subscriber
		// commits before the assertion (otherwise the re-render hasn't flushed).
		act(() => {
			hub.ingest({
				sensor: 'x',
				ts_ms: 0,
				value: { kind: 'json', value: { state: '42', attributes: { friendly_name: 'Foo' } } }
			});
		});

		expect(() => getByText('Foo')).not.toThrow();
		expect(() => getByText(/42/)).not.toThrow();
	});

	it('content-fit mode renders the box at max-content instead of the fixed rect size', () => {
		const hub = createTelemetryHub();
		const instance: WidgetInstance = {
			id: 'w2',
			type: 'test.json',
			sensor: 'x',
			rect: { x: 0, y: 0, w: 150, h: 44 },
			config: {}
		};
		const { container } = render(
			<WidgetHost hub={hub} instance={instance} contentSize editMode={false} />
		);
		const box = container.querySelector('.widget') as HTMLElement;
		expect(box.style.width).toBe('max-content');
		expect(box.style.height).toBe('max-content');
	});
});

describe('WidgetHost selection vs drag (multi-select group drag)', () => {
	// happy-dom doesn't implement pointer capture; stub it so begin()'s setPointerCapture won't throw.
	beforeAll(() => {
		Element.prototype.setPointerCapture = () => undefined;
	});

	const inst: WidgetInstance = {
		id: 'w1',
		type: 'test.json',
		sensor: 'x',
		rect: { x: 0, y: 0, w: 150, h: 44 },
		config: {}
	};
	const overlayOf = (el: HTMLElement) => el.querySelector('.drag-overlay') as HTMLElement;

	it('selects an unselected widget immediately on press', () => {
		const onSelect = vi.fn();
		const hub = createTelemetryHub();
		const { container } = render(
			<WidgetHost hub={hub} instance={inst} editMode onSelect={onSelect} />
		);
		fireEvent.pointerDown(overlayOf(container), {
			button: 0,
			pointerId: 1,
			clientX: 10,
			clientY: 10
		});
		expect(onSelect).toHaveBeenCalledWith({ id: 'w1' });
	});

	it('defers selection when pressing an already-selected widget, so a drag never collapses it', () => {
		const onSelect = vi.fn();
		const onChange = vi.fn();
		const onCommit = vi.fn();
		const hub = createTelemetryHub();
		const { container } = render(
			<WidgetHost
				hub={hub}
				instance={inst}
				editMode
				selected
				onSelect={onSelect}
				onChange={onChange}
				onCommit={onCommit}
			/>
		);
		const overlay = overlayOf(container);
		fireEvent.pointerDown(overlay, { button: 0, pointerId: 1, clientX: 10, clientY: 10 });
		expect(onSelect).not.toHaveBeenCalled(); // deferred → the (multi-)selection survives the press
		fireEvent.pointerMove(overlay, { pointerId: 1, clientX: 40, clientY: 10 }); // past DRAG_SLOP
		expect(onChange).toHaveBeenCalled();
		fireEvent.pointerUp(overlay, { pointerId: 1, clientX: 40, clientY: 10 });
		expect(onCommit).toHaveBeenCalled();
		expect(onSelect).not.toHaveBeenCalled(); // a real drag never re-selects → group stays selected
	});

	it('collapses to just this widget on a click (no drag) when it was already selected', () => {
		const onSelect = vi.fn();
		const hub = createTelemetryHub();
		const { container } = render(
			<WidgetHost hub={hub} instance={inst} editMode selected onSelect={onSelect} />
		);
		const overlay = overlayOf(container);
		fireEvent.pointerDown(overlay, { button: 0, pointerId: 1, clientX: 10, clientY: 10 });
		fireEvent.pointerUp(overlay, { pointerId: 1, clientX: 10, clientY: 10 }); // no movement
		expect(onSelect).toHaveBeenCalledTimes(1);
		expect(onSelect).toHaveBeenCalledWith({ id: 'w1' });
	});

	it('collapses on press when starting a resize (so resize acts on the single widget, not the group)', () => {
		const onSelect = vi.fn();
		const hub = createTelemetryHub();
		const { container } = render(
			<WidgetHost hub={hub} instance={inst} editMode selected onSelect={onSelect} />
		);
		const handle = container.querySelector('.handle.nw') as HTMLElement;
		fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientX: 10, clientY: 10 });
		expect(onSelect).toHaveBeenCalledWith({ id: 'w1' });
	});
});
