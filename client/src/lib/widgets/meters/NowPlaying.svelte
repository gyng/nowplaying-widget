<script lang="ts">
	// Self-sourcing media widget (binds: 'none'): the highest-priority now-playing track,
	// compact and box-fitting (the full-screen DefaultNowPlaying theme uses vh units that would
	// overflow a widget). Subscribes to the media store (fed once by startMediaSource) and is
	// token-themeable like the other meters. Shows nothing when nothing is playing.
	import { onMount } from 'svelte';
	import { mediaStore } from '../../../stores/stores';
	import { sortSessionsByPriority } from '../../components/NowPlaying/priority';
	import { startMediaSource } from '../../components/NowPlaying/source';
	import { convertByteArrayToObjectURL } from '../../components/NowPlaying/image';

	export let label: string | undefined = undefined;

	onMount(startMediaSource);

	$: session = sortSessionsByPriority($mediaStore.sessions, $mediaStore.sourcePriority).at(0);
	$: media = session?.last_media_update?.Media?.[0]?.media;
	$: title = media?.title ?? label ?? '';
	$: artist = media?.artist ?? '';
	$: thumbBytes = session?.last_media_update?.Media?.[1];
	$: thumb = thumbBytes?.data
		? convertByteArrayToObjectURL(thumbBytes.data ?? [], thumbBytes.content_type ?? '')
		: null;
</script>

<div class="np np-nowplaying" data-part="root">
	{#if title || thumb}
		{#if thumb}
			<!-- svelte-ignore a11y-missing-attribute -->
			<img class="np-thumb" data-part="thumb" src={thumb} />
		{/if}
		<div class="np-text">
			<span class="np-title" data-part="title">{title}</span>
			<span class="np-artist" data-part="artist">{artist}</span>
		</div>
	{/if}
</div>

<style>
	.np {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		height: 100%;
		overflow: hidden;
		color: var(--np-fg, #fff);
		font-family: var(--np-font, 'DIN Engschrift Std', 'Arial Narrow', sans-serif);
	}

	.np-thumb {
		height: 100%;
		aspect-ratio: 1 / 1;
		object-fit: cover;
		border-radius: var(--np-radius, 3px);
		flex-shrink: 0;
	}

	.np-text {
		display: flex;
		flex-direction: column;
		min-width: 0;
		gap: 1px;
	}

	.np-title {
		font-size: 15px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.np-artist {
		font-size: 11px;
		color: var(--np-label, rgb(218, 237, 226));
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
