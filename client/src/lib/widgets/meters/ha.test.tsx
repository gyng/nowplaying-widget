import { describe, expect, it } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import HaSensor from './HaSensor';
import HaLight from './HaLight';
import HaClimate from './HaClimate';

// A minimal HA state object as the Rust proxy forwards it (binds: 'json').
const sensorState = {
	state: '21.4',
	attributes: { friendly_name: 'Living Room Temp', unit_of_measurement: '°C' }
};

describe('HaSensor', () => {
	it('renders friendly name, state and unit', () => {
		const { getByText } = render(<HaSensor value={sensorState} />);
		expect(() => getByText(/Living Room Temp/i)).not.toThrow();
		expect(() => getByText(/21\.4\s*°C/)).not.toThrow();
	});

	it('falls back to placeholders when value is null', () => {
		const { getAllByText } = render(<HaSensor value={null} />);
		expect(getAllByText('—').length).toBeGreaterThan(0);
	});

	it('a config label overrides the friendly name', () => {
		const { getByText } = render(<HaSensor value={sensorState} label="Lounge" />);
		expect(() => getByText('Lounge')).not.toThrow();
	});
});

describe('HaLight', () => {
	const lightOn = { state: 'on', attributes: { friendly_name: 'Kitchen' } };
	const lightOff = { state: 'off', attributes: { friendly_name: 'Kitchen' } };

	it('shows ON/OFF from the entity state', () => {
		expect(() => render(<HaLight value={lightOn} />).getByText('ON')).not.toThrow();
		expect(() => render(<HaLight value={lightOff} />).getByText('OFF')).not.toThrow();
	});

	it('calls onControl (light/toggle) on click', () => {
		let detail: unknown = null;
		const { getByRole } = render(<HaLight value={lightOff} onControl={(e) => (detail = e)} />);
		fireEvent.click(getByRole('button'));
		expect(detail).toEqual({ domain: 'light', service: 'toggle' });
	});

	it('emits a brightness change for a dimmable light', () => {
		const dimmable = {
			state: 'on',
			attributes: {
				friendly_name: 'Kitchen',
				supported_color_modes: ['brightness'],
				brightness: 128
			}
		};
		let detail: unknown = null;
		const { getByRole } = render(<HaLight value={dimmable} onControl={(e) => (detail = e)} />);
		fireEvent.change(getByRole('slider'), { target: { value: '40' } });
		expect(detail).toEqual({ domain: 'light', service: 'turn_on', data: { brightness_pct: 40 } });
	});

	it('shows no brightness slider for a non-dimmable (onoff) light', () => {
		const onoff = {
			state: 'on',
			attributes: { friendly_name: 'Kitchen', supported_color_modes: ['onoff'] }
		};
		const { queryByRole } = render(<HaLight value={onoff} />);
		expect(queryByRole('slider')).toBeNull();
	});
});

describe('HaClimate', () => {
	it('renders current → target temperatures', () => {
		const climate = {
			state: 'heat',
			attributes: { friendly_name: 'Bedroom', current_temperature: 19, temperature: 21 }
		};
		const { getByText } = render(<HaClimate value={climate} />);
		expect(() => getByText(/19°\s*→\s*21°/)).not.toThrow();
		expect(() => getByText(/heat/i)).not.toThrow();
	});

	it('nudges the setpoint with the ± buttons (single-setpoint thermostat)', () => {
		const climate = {
			state: 'heat',
			attributes: {
				friendly_name: 'Bedroom',
				current_temperature: 19,
				temperature: 21,
				target_temp_step: 0.5,
				min_temp: 7,
				max_temp: 35
			}
		};
		let detail: unknown = null;
		const { getByLabelText } = render(
			<HaClimate value={climate} onControl={(e) => (detail = e)} />
		);
		fireEvent.click(getByLabelText('Raise Bedroom setpoint'));
		expect(detail).toEqual({
			domain: 'climate',
			service: 'set_temperature',
			data: { temperature: 21.5 }
		});
	});

	it('hides setpoint controls for a range thermostat', () => {
		const range = {
			state: 'heat_cool',
			attributes: { friendly_name: 'X', target_temp_high: 24, target_temp_low: 18 }
		};
		const { queryByLabelText } = render(<HaClimate value={range} onControl={() => undefined} />);
		expect(queryByLabelText('Raise X setpoint')).toBeNull();
	});
});
