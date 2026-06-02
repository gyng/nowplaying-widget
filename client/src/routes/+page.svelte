<script lang="ts">
	import NowPlaying from '../lib/components/NowPlaying/NowPlaying.svelte';
	import Canvas from '../lib/widgets/Canvas.svelte';
	import { isStudioWindow, monitorParam } from '../lib/overlay';

	const studio = isStudioWindow();
	// NowPlaying only on the primary overlay (not secondaries, not the studio window).
	const isPrimary = monitorParam() === null && !studio;
</script>

<section>
	{#if studio}
		<Canvas studio />
	{:else}
		{#if isPrimary}
			<NowPlaying />
		{/if}
		<Canvas />
	{/if}
</section>
