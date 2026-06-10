import type { ComponentType } from 'react';

// `data` carries domain-specific args: HA uses none (entity comes from the sensor id); the
// now-playing widget passes `{ source }` so the backend can target the right media session.
export type ControlEvent = { domain: string; service: string; data?: Record<string, unknown> };

// What WidgetHost passes down to a meter: the bound sensor's `value`/`history` (or the raw value for
// json/text-bound widgets), an `onControl` callback for interactive widgets, plus the widget's
// config fields spread on top. A multi-sensor type (WidgetMeta.sensors) additionally receives a
// `sensors` prop — name → live SensorState, resolved by WidgetHost — which rides the index
// signature here so a config key named `sensors` on OTHER types (e.g. the AI Briefing's sensor-id
// CSV) keeps its own shape. Individual meters declare a NARROWER prop type; `asMeter` adapts them
// for the registry.
export type MeterProps = {
	value?: number | string | number[] | unknown | null;
	history?: number[];
	onControl?: (e: ControlEvent) => void;
	[key: string]: unknown;
};

export type MeterComponent = ComponentType<MeterProps>;

/**
 * Adapt a correctly-typed meter (props ⊆ MeterProps) to the registry's `MeterComponent`. The single
 * variance bridge: WidgetHost passes a superset of the meter's props (React ignores extra keys),
 * and the `P extends MeterProps` constraint keeps every overlapping prop's type compatible — TS
 * just can't express that contravariance on a heterogeneous registry without this one checked cast.
 */
export function asMeter<P extends MeterProps>(component: ComponentType<P>): MeterComponent {
	return component as MeterComponent;
}
