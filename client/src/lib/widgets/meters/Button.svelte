<script lang="ts">
	// Demo interactive widget: a counter button. It only receives clicks in passive
	// mode when the cursor watcher has turned off click-through over it — so it's the
	// test fixture for per-widget click-through.
	export let label = 'tap';
	let count = 0;
</script>

<button class="counter" on:click={() => (count += 1)}>
	<span class="label">{label}</span>
	<span class="count">{count}</span>
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
		border: 1px solid rgba(119, 196, 211, 0.8);
		border-radius: 4px;
		background: rgba(10, 10, 12, 0.6);
		color: #fff;
		font-family: 'DIN Engschrift Std', 'Arial Narrow', sans-serif;
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
