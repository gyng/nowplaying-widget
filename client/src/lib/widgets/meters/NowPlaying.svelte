<script lang="ts">
	// Self-sourcing media widget (binds: 'none'): the highest-priority now-playing track. Renders
	// STRUCTURE only — the default look (font / sizes / colors) ships as the instance's editable
	// `css` (NOWPLAYING_DEFAULT_CSS) so it's fully restylable. Cover sits above the title/artist and
	// is contained to the box (no fixed aspect, never overflows the cell). The progress bar, timers
	// and transport controls are present in the DOM but HIDDEN by default — un-hide them via css for
	// players that expose a timeline (foobar2000 does not, so they stay idle there).
	import { onMount } from 'svelte';
	import { mediaStore } from '../../../stores/stores';
	import { sortSessionsByPriority } from '../../components/NowPlaying/priority';
	import { startMediaSource } from '../../components/NowPlaying/source';
	import { convertByteArrayToObjectURL } from '../../components/NowPlaying/image';

	export let label: string | undefined = undefined;

	onMount(startMediaSource);

	$: session = sortSessionsByPriority($mediaStore.sessions, $mediaStore.sourcePriority).at(0);
	$: model = session?.last_media_update?.Media?.[0];
	$: media = model?.media;
	$: title = media?.title ?? label ?? '';
	$: artist = media?.artist ?? '';
	$: timeline = model?.timeline;
	$: position = timeline?.position ?? 0;
	$: duration = timeline?.end ?? 0;
	$: progress = duration > 0 ? Math.min(100, Math.max(0, (position / duration) * 100)) : 0;
	$: playing = model?.playback?.status === 'Playing';
	$: thumbBytes = session?.last_media_update?.Media?.[1];
	$: thumb = thumbBytes?.data
		? convertByteArrayToObjectURL(thumbBytes.data ?? [], thumbBytes.content_type ?? '')
		: null;

	const fmtTime = (v: number): string => {
		const s = Math.max(0, Math.floor(v));
		return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
	};
</script>

<div class="np-nowplaying" data-part="root">
	{#if title || thumb}
		<!-- Always rendered (src swaps in place) so the box is stable — no layout shift when the
		     art loads on a track change. -->
		<!-- svelte-ignore a11y-missing-attribute -->
		<img class="np-thumb" data-part="thumb" src={thumb || undefined} />
		<span class="np-title" data-part="title">{title}</span>
		{#if artist}<span class="np-artist" data-part="artist">{artist}</span>{/if}
		<!-- Hidden by default (un-hide via css). Idle for players without a timeline (e.g. fb2k). -->
		<div class="np-progress" data-part="progress">
			<div class="np-progress-fill" data-part="progress-fill" style="width: {progress}%" />
		</div>
		<div class="np-times" data-part="times">
			<span class="np-position" data-part="position">{fmtTime(position)}</span>
			<span class="np-duration" data-part="duration">{fmtTime(duration)}</span>
		</div>
		<div class="np-controls" data-part="controls">
			<button type="button" class="np-prev" data-part="prev" aria-label="Previous">⏮</button>
			<button type="button" class="np-playpause" data-part="playpause" aria-label="Play/pause"
				>{playing ? '⏸' : '▶'}</button
			>
			<button type="button" class="np-next" data-part="next" aria-label="Next">⏭</button>
		</div>
	{/if}
</div>

<!-- Pure DOM — no component styles. The ENTIRE stylesheet (layout + look) ships as the instance's
     editable `css` (NOWPLAYING_DEFAULT_CSS), so the whole widget is restylable / inspectable. -->
