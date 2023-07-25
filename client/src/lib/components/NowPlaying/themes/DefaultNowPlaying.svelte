<script lang="ts">
	import type { SessionRecord } from '../../../../stores/stores';
	import { convertByteArrayToObjectURL } from '../image';

	export let session: SessionRecord | undefined;

	// Check if this needs memoization; alternatively send asset urls over from Rust
	$: thumbnailImageUrl = session?.last_media_update?.Media[1]?.data
		? convertByteArrayToObjectURL(
				session?.last_media_update.Media[1]?.data ?? [],
				session?.last_media_update.Media[1]?.content_type ?? ''
		  )
		: null;
</script>

<div
	id="root"
	class={`${session?.last_model_update?.Model?.playback?.status?.toLowerCase() ?? ''}`}
>
	<!-- svelte-ignore a11y-missing-attribute -->
	<img id="thumbnail" src={thumbnailImageUrl} />
	<div id="np">
		<div id="np-1">{session?.last_media_update?.Media?.[0]?.media?.title ?? ''}</div>
		<div id="np-2">{session?.last_media_update?.Media?.[0]?.media?.artist ?? ''}</div>
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

	#root:not(.playing):hover {
		opacity: 1;
	}
</style>
