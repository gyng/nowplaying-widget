<script lang="ts">
	// Presentational HA meter (molecule): a read-only climate readout — current temperature
	// → target setpoint, pulled from the entity's JSON attributes (binds: 'json'). Control
	// (raising/lowering the setpoint) is a future enhancement; v1 displays only. Prop-only,
	// token-themeable (AGENTS.md §6).
	type HaState = { state?: string; attributes?: Record<string, unknown> };

	export let value: unknown = null;
	export let label: string | undefined = undefined;

	$: s = (value ?? null) as HaState | null;
	$: attrs = s?.attributes ?? {};
	$: name = label ?? (attrs.friendly_name as string | undefined) ?? 'Climate';
	$: mode = s?.state ?? '—';
	$: current = attrs.current_temperature as number | undefined;
	$: target = attrs.temperature as number | undefined;
	$: fmt = (n: number | undefined): string => (n === undefined ? '—' : `${n}°`);
</script>

<div class="ha-climate np-ha-climate" data-part="root">
	<span class="label" data-part="label">{name}</span>
	<span class="temps" data-part="value">{fmt(current)} → {fmt(target)}</span>
	<span class="mode" data-part="mode">{mode}</span>
</div>

<style>
	.ha-climate {
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 1px;
		width: 100%;
		height: 100%;
		color: var(--np-fg, #fff);
		font-family: var(--np-font, 'Bahnschrift', 'Arial Narrow', sans-serif);
	}

	.label {
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: var(--np-label, rgb(218, 237, 226));
		opacity: 0.8;
	}

	.temps {
		font-size: 17px;
	}

	.mode {
		font-size: 10px;
		opacity: 0.6;
		text-transform: capitalize;
	}
</style>
