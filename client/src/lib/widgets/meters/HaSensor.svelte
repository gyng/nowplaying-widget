<script lang="ts">
	// Presentational HA meter (molecule): renders one Home Assistant entity's state. The
	// `value` prop is the raw HA state object (binds: 'json'), forwarded by WidgetHost from
	// the `ha.<entity_id>` sensor the Rust proxy feeds over telemetry. Prop-only, themeable
	// via tokens — no store, no Tauri (AGENTS.md §6).
	type HaState = { state?: string; attributes?: Record<string, unknown> };

	export let value: unknown = null;
	export let label: string | undefined = undefined;

	$: s = (value ?? null) as HaState | null;
	$: name = label ?? (s?.attributes?.friendly_name as string | undefined) ?? '—';
	$: state = s?.state ?? '—';
	$: unit = (s?.attributes?.unit_of_measurement as string | undefined) ?? '';
</script>

<div class="ha-sensor np-ha-sensor" data-part="root">
	<span class="label" data-part="label">{name}</span>
	<span class="value" data-part="value">{state}{unit ? ` ${unit}` : ''}</span>
</div>

<style>
	.ha-sensor {
		display: flex;
		flex-direction: column;
		justify-content: center;
		width: 100%;
		height: 100%;
		gap: 1px;
		color: var(--np-fg, #fff);
		font-family: var(--np-font, 'DIN Engschrift Std', 'Arial Narrow', sans-serif);
	}

	.label {
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: var(--np-label, rgb(218, 237, 226));
		opacity: 0.8;
	}

	.value {
		font-size: 17px;
	}
</style>
