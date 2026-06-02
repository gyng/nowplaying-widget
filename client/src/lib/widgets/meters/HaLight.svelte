<script lang="ts">
	// Interactive HA meter (molecule): a light toggle. Reads on/off from the entity's JSON
	// state (binds: 'json'); a click dispatches a `control` event (domain/service) that
	// WidgetHost bubbles to Canvas, which makes the Tauri `ha_call_service` call. The meter
	// itself stays prop-only and Tauri-free (AGENTS.md §6). Catches clicks in passive mode
	// via `interactive: true` on its meta.
	import { createEventDispatcher } from 'svelte';

	type HaState = { state?: string; attributes?: Record<string, unknown> };

	export let value: unknown = null;
	export let label: string | undefined = undefined;

	const dispatch = createEventDispatcher<{ control: { domain: string; service: string } }>();

	$: s = (value ?? null) as HaState | null;
	$: on = s?.state === 'on';
	$: name = label ?? (s?.attributes?.friendly_name as string | undefined) ?? 'Light';

	function toggle() {
		dispatch('control', { domain: 'light', service: 'toggle' });
	}
</script>

<button class="ha-light np-ha-light" class:on data-part="root" on:click={toggle}>
	<span class="label" data-part="label">{name}</span>
	<span class="state" data-part="state">{on ? 'ON' : 'OFF'}</span>
</button>

<style>
	.ha-light {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		justify-content: center;
		gap: 2px;
		width: 100%;
		height: 100%;
		padding: 0 10px;
		border: 1px solid var(--np-accent, rgba(119, 196, 211, 0.8));
		border-radius: var(--np-radius, 4px);
		background: var(--np-bg, rgba(10, 10, 12, 0.6));
		color: var(--np-fg, #fff);
		font-family: var(--np-font-display, 'DIN Engschrift Std', 'Arial Narrow', sans-serif);
		cursor: pointer;
	}

	.ha-light.on {
		background: var(--np-accent, rgba(119, 196, 211, 0.85));
		color: var(--np-bg, #0a0a0c);
	}

	.label {
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		opacity: 0.8;
	}

	.state {
		font-size: 16px;
		letter-spacing: 1px;
	}
</style>
