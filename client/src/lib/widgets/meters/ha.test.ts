import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, fireEvent } from '@testing-library/svelte';
import HaSensor from './HaSensor.svelte';
import HaLight from './HaLight.svelte';
import HaClimate from './HaClimate.svelte';

// Bound queries search document.body, so unmount between tests to avoid leftover renders.
afterEach(cleanup);

// A minimal HA state object as the Rust proxy forwards it (binds: 'json').
const sensorState = {
	state: '21.4',
	attributes: { friendly_name: 'Living Room Temp', unit_of_measurement: '°C' }
};

describe('HaSensor', () => {
	it('renders friendly name, state and unit', () => {
		const { getByText } = render(HaSensor, { value: sensorState });
		expect(() => getByText(/Living Room Temp/i)).not.toThrow();
		expect(() => getByText(/21\.4\s*°C/)).not.toThrow();
	});

	it('falls back to placeholders when value is null', () => {
		const { getAllByText } = render(HaSensor, { value: null });
		expect(getAllByText('—').length).toBeGreaterThan(0);
	});

	it('a config label overrides the friendly name', () => {
		const { getByText } = render(HaSensor, { value: sensorState, label: 'Lounge' });
		expect(() => getByText('Lounge')).not.toThrow();
	});
});

describe('HaLight', () => {
	const lightOn = { state: 'on', attributes: { friendly_name: 'Kitchen' } };
	const lightOff = { state: 'off', attributes: { friendly_name: 'Kitchen' } };

	it('shows ON/OFF from the entity state', () => {
		expect(() => render(HaLight, { value: lightOn }).getByText('ON')).not.toThrow();
		expect(() => render(HaLight, { value: lightOff }).getByText('OFF')).not.toThrow();
	});

	it('dispatches a control event (light/toggle) on click', async () => {
		const { getByRole, component } = render(HaLight, { value: lightOff });
		let detail: { domain: string; service: string } | null = null;
		component.$on('control', (e) => (detail = e.detail));
		await fireEvent.click(getByRole('button'));
		expect(detail).toEqual({ domain: 'light', service: 'toggle' });
	});
});

describe('HaClimate', () => {
	it('renders current → target temperatures', () => {
		const climate = {
			state: 'heat',
			attributes: { friendly_name: 'Bedroom', current_temperature: 19, temperature: 21 }
		};
		const { getByText } = render(HaClimate, { value: climate });
		expect(() => getByText(/19°\s*→\s*21°/)).not.toThrow();
		expect(() => getByText(/heat/i)).not.toThrow();
	});
});
