<script lang="ts">
	import NowPlaying from '../lib/components/NowPlaying/NowPlaying.svelte';
	import Canvas from '../lib/widgets/Canvas.svelte';
	import { monitorParam } from '../lib/overlay';

	// NowPlaying renders only on the primary overlay; secondary monitors show widgets only.
	const isPrimary = monitorParam() === null;
</script>

<section>
	{#if isPrimary}
		<NowPlaying />
	{/if}
	<Canvas />
</section>
