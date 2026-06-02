<script lang="ts">
	import Canvas from '../lib/widgets/Canvas.svelte';
	import { isStudioWindow } from '../lib/overlay';

	// The studio window edits layouts; every other window is a live overlay. The legacy
	// NowPlaying media widget used to be hard-injected on the primary overlay — removed (it
	// rendered a stray line when idle). It can return as a registered `nowplaying` widget type.
	const studio = isStudioWindow();
</script>

<section>
	<Canvas {studio} />
</section>
