<script lang="ts">
	import type { MediaRecord } from '../../../../stores/stores';

	export let currentMedia: MediaRecord | undefined;
</script>

<div id="root" class={`${currentMedia?.session?.playback?.status?.toLowerCase() ?? ''}`}>
	<!-- svelte-ignore a11y-missing-attribute -->

	<img id="thumbnail" src={currentMedia?.thumbnail?.url} />
	<div id="np">
		<div id="np-1">{currentMedia?.session?.media?.title ?? ''}</div>
		<div id="np-2">{currentMedia?.session?.media?.artist ?? ''}</div>
	</div>
</div>

<style>
	#root {
		display: flex;
		flex-direction: column;
		font-family: Bahnschrift, 'DIN Alternate', 'Franklin Gothic Medium', 'Nimbus Sans Narrow',
			sans-serif-condensed, sans-serif;
		color: white;
		font-size: calc(0.7 * 10vh);
		line-height: 1.3em;
		transition: 0.2s ease-in;
	}

	#thumbnail {
		max-height: 75vh;
		max-width: 100vw;
		aspect-ratio: 1 / 1;
		object-fit: contain;
		object-position: left bottom;
		background-color: transparent;
	}

	#np {
		margin-top: 0.5em;
	}

	#np div {
		white-space: nowrap;
		text-overflow: ellipsis;
		overflow: hidden;
		max-width: 100vw;
	}

	#root:not(.playing) {
		opacity: 0.2;
	}
</style>
