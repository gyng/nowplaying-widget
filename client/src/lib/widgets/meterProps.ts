import type { ComponentType } from 'react';

export type ControlEvent = { domain: string; service: string };

// What WidgetHost passes down to a meter: the bound sensor's `value`/`history` (or the raw value for
// json/text-bound widgets), an `onControl` callback for interactive widgets, plus the widget's
// config fields spread on top. Individual meters declare a NARROWER prop type and are registered
// with a cast (mirroring the Svelte registry's `as unknown as` — config shapes vary per type).
export type MeterProps = {
	value?: number | string | number[] | unknown | null;
	history?: number[];
	onControl?: (e: ControlEvent) => void;
	[key: string]: unknown;
};

export type MeterComponent = ComponentType<MeterProps>;
