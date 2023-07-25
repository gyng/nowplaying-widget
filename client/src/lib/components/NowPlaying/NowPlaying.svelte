<script lang="ts">
	import { invoke } from '@tauri-apps/api/tauri';
	import { getVersion } from '@tauri-apps/api/app';
	import * as tauriWindow from '@tauri-apps/api/window';
	import * as tauriEvent from '@tauri-apps/api/event';
	import {
		defaultState,
		type SessionRecord,
		handleInitialize,
		handleUpdate,
		handleDelete
	} from '../../../stores/stores';
	import { mediaStore } from '../../../stores/stores';
	import DefaultNowPlaying from './themes/DefaultNowPlaying.svelte';
	import { sortSessionsByPriority } from './priority';
	import ThemeInjector from './themes/ThemeInjector.svelte';

	type InitialEvent = {
		sessions: Record<number, SessionRecord>;
	};
	invoke<InitialEvent>('get_initial_sessions', { message: '' }).then((ev) => {
		// TODO: Store timestamps in backend so we know which order to apply model/media updates
		// Model updates can be after media updates
		let sessions: Record<number, SessionRecord> = ev.sessions;
		handleInitialize({ sessions });
	});

	tauriEvent.listen<SessionRecord>('session_update', (ev) => {
		console.log('recv', ev.event, ev);
		handleUpdate({ sessionRecord: ev.payload });
	});

	tauriEvent.listen<SessionRecord>('session_delete', (ev) => {
		console.log('recv', ev.event, ev);
		handleDelete({ sessionRecord: ev.payload });
	});

	tauriEvent.listen<SessionRecord>('test', (ev) => {
		console.log('recv', ev.event, ev);
	});

	let currentSession: SessionRecord | undefined;
	let allMedia: Array<{ source: string; title?: string }>;
	let sourcePriority: string;
	let styleOverride: string;
	let appVersion: string;

	mediaStore.subscribe((store) => {
		const orderedSession = sortSessionsByPriority(store.sessions, store.sourcePriority);
		currentSession = orderedSession.at(0);
		console.log('currentSession', currentSession);
		sourcePriority = store.sourcePriority;
		styleOverride = store.styleOverride;
		allMedia = Object.entries(store.sessions).map(([k, v]) => ({
			source: v.source,
			title: v.last_model_update?.Model?.media?.title
		}));
	});

	getVersion().then((v) => {
		appVersion = v;
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
	<ThemeInjector css={styleOverride} html="" />

	<DefaultNowPlaying session={currentSession} />

	<div id="debug">
		<button
			on:click={() => {
				decorations = !decorations;
				tauriWindow.getCurrent().setDecorations(decorations);
			}}>{decorations ? 'Disable decorations' : 'Enable decorations'}</button
		>

		<details>
			<summary>Style override</summary>
			<label>
				<span>Hint: Right-click > Inspect to see class names</span>
				<textarea
					style="width: calc(100% - 6px)"
					rows="5"
					value={styleOverride}
					spellcheck={false}
					on:change={(ev) => {
						ev.preventDefault();
						mediaStore.update((store) => ({
							...store,
							styleOverride: ev.currentTarget.value
						}));
					}}
				/>
			</label>
		</details>

		<details>
			<summary>Priority list</summary>
			<label>
				<span>Source priority list<br />higher = top; not in list = lowest</span>
				<div>Current source: {currentSession?.source}</div>
				<textarea
					style="width: calc(100% - 6px)"
					rows="5"
					value={sourcePriority}
					spellcheck={false}
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
					<li>{m.source}: {m.title}</li>
				{/each}
			</ol>
		</details>

		<details>
			<summary>Debug</summary>
			<button
				on:click={() => {
					tauriWindow.getCurrent().close();
				}}>Close</button
			>
			<button
				on:click={() => {
					mediaStore.update(() => defaultState);
				}}>Reset settings to default</button
			>
			<button
				on:click={() => {
					window.location.reload();
				}}>Reload page</button
			>

			<span>Version {appVersion}</span>
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
