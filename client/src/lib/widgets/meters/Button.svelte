<script lang="ts">
	// Demo interactive widget: a counter button. It only receives clicks in passive mode
	// when the cursor watcher has turned off click-through over it — so it's the test
	// fixture for per-widget click-through. Themeable via --np-accent / -bg / -fg / -font.
	export let label = 'tap';
	let count = 0;
</script>

<button class="counter np-button" on:click={() => (count += 1)}>
	<span class="label" data-part="label">{label}</span>
	<span class="count" data-part="value">{count}</span>
</button>

<style>
	.counter {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 2px;
		border: 1px solid var(--np-accent, rgba(119, 196, 211, 0.8));
		border-radius: 4px;
		background: var(--np-bg, rgba(10, 10, 12, 0.6));
		color: var(--np-fg, #fff);
		font-family: var(--np-font-display, 'Bahnschrift', 'Arial Narrow', sans-serif);
		cursor: pointer;
	}

	.label {
		font-size: 10px;
		opacity: 0.7;
		text-transform: uppercase;
		letter-spacing: 1px;
	}

	.count {
		font-size: 22px;
	}
</style>
