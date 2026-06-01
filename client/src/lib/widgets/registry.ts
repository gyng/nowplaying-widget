// Maps a widget `type` string to its presentational component. Adding a meter =
// add a component and one entry here; instances reference it by `type`.

import type { SvelteComponent } from 'svelte';
import Gauge from './meters/Gauge.svelte';
import Sparkline from './meters/Sparkline.svelte';
import Text from './meters/Text.svelte';
import Clock from './meters/Clock.svelte';
import Bar from './meters/Bar.svelte';
import Button from './meters/Button.svelte';

export type MeterComponent = typeof SvelteComponent;

export const registry: Record<string, MeterComponent> = {
	gauge: Gauge as unknown as MeterComponent,
	sparkline: Sparkline as unknown as MeterComponent,
	text: Text as unknown as MeterComponent,
	clock: Clock as unknown as MeterComponent,
	bar: Bar as unknown as MeterComponent,
	button: Button as unknown as MeterComponent
};
