<script lang="ts">
	import { invoke } from '@tauri-apps/api/tauri';
	import * as tauriWindow from '@tauri-apps/api/window';
	import * as tauriEvent from '@tauri-apps/api/event';
	import {
		handleMediaEvent,
		handleModelEvent,
		type MediaRecord,
		type ThumbnailInfo,
		type SessionModel,
		type SessionUpdateEvent,
		type SessionUpdateEventMedia,
		type SessionUpdateEventModel
	} from '../../../stores/stores';
	import { mediaStore } from '../../../stores/stores';
	import DefaultNowPlaying from './themes/DefaultNowPlaying.svelte';

	type InitialEvent = {
		last_media_update: { Media: SessionUpdateEventMedia } | undefined;
		last_model_update: { Model: SessionUpdateEvent } | undefined;
	};
	invoke<InitialEvent>('get_last_update', { message: '' }).then((ev) => {
		// TODO: Store timestamps in backend so we know which order to apply model/media updates
		// Model updates can be after media updates
		if (ev.last_model_update) {
			handleModelEvent({
				session: ev.last_model_update.Model as unknown as SessionUpdateEventModel
			});
		}

		if (ev.last_media_update) {
			const [session, thumbnail] = ev.last_media_update.Media as unknown as SessionUpdateEventMedia;
			handleMediaEvent({ session, thumbnail });
		}
	});

	type MediaPayload = { Media: [SessionModel, ThumbnailInfo] };
	tauriEvent.listen<MediaPayload>('media_update', (ev) => {
		console.log('recv', ev.event, ev);
		const payload = ev.payload as MediaPayload;
		const [session, thumbnail] = payload.Media;
		handleMediaEvent({ session, thumbnail });
	});

	type ModelPayload = { Model: SessionModel };
	tauriEvent.listen<ModelPayload>('model_update', (ev) => {
		console.log('recv', ev.event, ev);
		const payload = ev.payload as ModelPayload;
		handleModelEvent({ session: payload.Model });
	});

	let currentMedia: MediaRecord | undefined;
	let allMedia: MediaRecord[];
	let sourcePriority: string;

	mediaStore.subscribe((store) => {
		const orderedMedia = Object.values(store.currentMedia)
			.sort((a, b) => b.timestamp - a.timestamp)
			.sort(
				(a, b) =>
					store.sourcePriority.indexOf(a.session?.source.toLowerCase() ?? '') -
					store.sourcePriority.indexOf(b.session?.source.toLowerCase() ?? '')
			)
			.sort((_, b) => (b.session?.playback?.status === 'Playing' ? 1 : -1));
		currentMedia = orderedMedia.at(0);
		sourcePriority = store.sourcePriority;
		allMedia = orderedMedia;
	});

	// Workaround to enable transparent backgrounds on initial launch
	// https://github.com/tauri-apps/tao/issues/72
	let decorations = false;
	tauriWindow.getCurrent().setDecorations(decorations);
</script>

<section
	on:dragstart={(e) => {
		e.preventDefault();
		tauriWindow.getCurrent().startDragging();
	}}
>
	<DefaultNowPlaying {currentMedia} />

	<div id="debug">
		<button
			on:click={() => {
				decorations = !decorations;
				tauriWindow.getCurrent().setDecorations(decorations);
			}}>{decorations ? 'Disable decorations' : 'Enable decorations'}</button
		>

		<details>
			<summary>Priority list</summary>
			<label>
				<span>Source priority list<br />higher = top; not in list = lowest</span>
				<div>Current source: {currentMedia?.session?.source}</div>
				<textarea
					style="width: calc(100% - 6px)"
					rows="5"
					value={sourcePriority}
					on:change={(ev) => {
						ev.preventDefault();
						mediaStore.update((store) => ({
							...store,
							sourcePriority: ev.currentTarget.value.toLowerCase()
						}));
					}}
				/>
			</label>
		</details>

		<details>
			<summary>All media</summary>
			<ol>
				{#each allMedia as m}
					<li>{m.session?.source}: {m.session?.media?.title}</li>
				{/each}
			</ol>
		</details>
	</div>
</section>

<style>
	#debug {
		opacity: 0;
		position: fixed;
		top: 0;
		left: 0;
		padding: 5px;
		background: rgba(255, 255, 255, 0.8);
		display: grid;
		font-family: monospace;
	}

	#debug:hover {
		opacity: 1;
	}

	details {
		cursor: pointer;
		user-select: none;
	}
</style>
