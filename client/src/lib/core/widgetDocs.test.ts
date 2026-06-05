import { describe, expect, it } from 'vitest';
import { widgetReferenceMarkdown } from './widgetDocs';
import type { WidgetMeta } from './widget';

const metas: WidgetMeta[] = [
	{
		type: 'gauge',
		label: 'Gauge',
		description: 'Arc gauge.',
		binds: 'scalar',
		defaultSensor: 'cpu.total',
		defaultSize: { w: 110, h: 110 },
		defaultConfig: { label: 'CPU', min: 0, max: 100 },
		configFields: [
			{ key: 'label', label: 'label', kind: 'text' },
			{ key: 'min', label: 'min', kind: 'number', help: 'empty value' },
			{ key: 'mode', label: 'mode', kind: 'select', options: ['a', 'b'] }
		]
	},
	{
		type: 'clock',
		label: 'Clock',
		binds: 'none',
		intrinsic: true,
		defaultSize: { w: 160, h: 40 }
	}
];

describe('widgetReferenceMarkdown', () => {
	const md = widgetReferenceMarkdown(metas);

	it('includes the layout-shape preamble and a section per widget', () => {
		expect(md).toContain('# Widget reference');
		expect(md).toContain('## Layout shape');
		expect(md).toContain('### Gauge — `gauge`');
		expect(md).toContain('### Clock — `clock`');
	});

	it('documents the sensor binding (and self-sourcing)', () => {
		expect(md).toContain('binds a `scalar` sensor (default `cpu.total`)');
		expect(md).toContain('none (self-sourcing)');
	});

	it('renders a config table with defaults pulled from defaultConfig', () => {
		expect(md).toContain('| key | type | default | options / range | description |');
		expect(md).toContain('| `label` | text | "CPU" |');
		expect(md).toContain('| `mode` | select |  | `a`, `b` |');
	});

	it('notes intrinsic + no-fields widgets', () => {
		expect(md).toContain('Intrinsic size');
		expect(md).toContain('_No configurable fields._');
	});

	it('escapes pipes so the table stays well-formed', () => {
		const piped = widgetReferenceMarkdown([
			{
				type: 't',
				label: 'T',
				binds: 'scalar',
				configFields: [{ key: 'k', label: 'k', kind: 'text', help: 'a | b' }]
			}
		]);
		expect(piped).toContain('a \\| b');
	});
});
