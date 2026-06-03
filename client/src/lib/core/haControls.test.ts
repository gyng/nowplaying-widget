import { describe, expect, it } from 'vitest';
import {
	brightnessToPct,
	climateNudge,
	climateSetHvacMode,
	climateSetTemperature,
	climateUsesRange,
	lightBrightnessPct,
	lightColorTempKelvin,
	lightRgb,
	lightSupports
} from './haControls';

describe('haControls — light', () => {
	it('reads capabilities from supported_color_modes', () => {
		expect(lightSupports({ supported_color_modes: ['onoff'] }, 'brightness')).toBe(false);
		expect(lightSupports({ supported_color_modes: ['brightness'] }, 'brightness')).toBe(true);
		expect(lightSupports({ supported_color_modes: ['color_temp'] }, 'color_temp')).toBe(true);
		expect(lightSupports({ supported_color_modes: ['color_temp'] }, 'rgb')).toBe(false);
		expect(lightSupports({ supported_color_modes: ['rgbw'] }, 'rgb')).toBe(true);
	});

	it('converts brightness 0..255 to a percentage', () => {
		expect(brightnessToPct(undefined)).toBe(0);
		expect(brightnessToPct(0)).toBe(0);
		expect(brightnessToPct(255)).toBe(100);
		expect(brightnessToPct(128)).toBe(50);
	});

	it('builds turn_on with a clamped brightness_pct', () => {
		expect(lightBrightnessPct(50)).toEqual({ service: 'turn_on', data: { brightness_pct: 50 } });
		expect(lightBrightnessPct(150).data.brightness_pct).toBe(100);
		expect(lightBrightnessPct(-5).data.brightness_pct).toBe(0);
	});

	it('clamps color_temp_kelvin to the device range', () => {
		const attrs = { min_color_temp_kelvin: 2200, max_color_temp_kelvin: 4000 };
		expect(lightColorTempKelvin(3000, attrs).data.color_temp_kelvin).toBe(3000);
		expect(lightColorTempKelvin(9000, attrs).data.color_temp_kelvin).toBe(4000);
		expect(lightColorTempKelvin(1000, attrs).data.color_temp_kelvin).toBe(2200);
	});

	it('clamps rgb components to 0..255', () => {
		expect(lightRgb(300, -10, 128).data.rgb_color).toEqual([255, 0, 128]);
	});
});

describe('haControls — climate', () => {
	it('detects single-setpoint vs range', () => {
		expect(climateUsesRange({ temperature: 21 })).toBe(false);
		expect(climateUsesRange({ target_temp_high: 24, target_temp_low: 18 })).toBe(true);
	});

	it('builds set_temperature clamped to min/max', () => {
		const attrs = { min_temp: 10, max_temp: 30 };
		expect(climateSetTemperature(21, attrs).data.temperature).toBe(21);
		expect(climateSetTemperature(99, attrs).data.temperature).toBe(30);
		expect(climateSetTemperature(0, attrs).data.temperature).toBe(10);
	});

	it('nudges the setpoint by ± one step from the current target', () => {
		const attrs = { temperature: 21, target_temp_step: 0.5, min_temp: 7, max_temp: 35 };
		expect(climateNudge(attrs, 1).data.temperature).toBe(21.5);
		expect(climateNudge(attrs, -1).data.temperature).toBe(20.5);
		// Clamped at the max.
		expect(climateNudge({ temperature: 35, max_temp: 35 }, 1).data.temperature).toBe(35);
	});

	it('builds set_hvac_mode', () => {
		expect(climateSetHvacMode('heat')).toEqual({
			service: 'set_hvac_mode',
			data: { hvac_mode: 'heat' }
		});
	});
});
