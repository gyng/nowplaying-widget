import { describe, expect, it } from 'vitest';
import { formatSensorValue } from './SensorList';

describe('formatSensorValue', () => {
	it('renders a dash for no value', () => {
		expect(formatSensorValue(null)).toBe('—');
	});

	it('renders integers plainly and floats to 2dp', () => {
		expect(formatSensorValue({ kind: 'scalar', value: 42 })).toBe('42');
		expect(formatSensorValue({ kind: 'scalar', value: 3.14159 })).toBe('3.14');
	});

	it('renders text as-is', () => {
		expect(formatSensorValue({ kind: 'text', value: 'playing' })).toBe('playing');
	});

	it('renders the last point of a series with an ellipsis', () => {
		expect(formatSensorValue({ kind: 'series', value: [1, 2, 3] })).toBe('3 ⋯');
		expect(formatSensorValue({ kind: 'series', value: [] })).toBe('[ ]');
	});

	it('renders json compactly (truncated)', () => {
		expect(formatSensorValue({ kind: 'json', value: { a: 1 } })).toBe('{"a":1}');
	});
});
