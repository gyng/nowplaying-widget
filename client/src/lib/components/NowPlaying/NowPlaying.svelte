<script lang="ts">
	import { invoke } from '@tauri-apps/api/core';
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

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const debug = (...args: any[]) => {
		if (debugMode) {
			console.log(...args);
		}
	};

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
		debug('recv', ev.event, ev);
		handleUpdate({ sessionRecord: ev.payload });
	});

	tauriEvent.listen<SessionRecord>('session_delete', (ev) => {
		debug('recv', ev.event, ev);
		handleDelete({ sessionRecord: ev.payload });
	});

	let currentSession: SessionRecord | undefined;
	let allMedia: Array<{ source: string; title?: string }>;
	let sourcePriority: string;
	let styleOverride: string;
	let appVersion: string;
	let debugMode = false;

	mediaStore.subscribe((store) => {
		const orderedSession = sortSessionsByPriority(store.sessions, store.sourcePriority);
		currentSession = orderedSession.at(0);

		debug('currentSession', currentSession);
		sourcePriority = store.sourcePriority;
		styleOverride = store.styleOverride;
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		allMedia = Object.entries(store.sessions).map(([_k, v]) => ({
			source: v.source,
			title: v.last_model_update?.Model?.media?.title
		}));
	});

	getVersion().then((v) => {
		appVersion = v;
	});

	// window-state plugin doesn't seem to save decoration state
	let decorations = false;
	tauriWindow.getCurrentWindow().setDecorations(false);

	// setShadow(false) doesn't seem to be working in v2 rc0 for undecorated windows?
	tauriWindow.getCurrentWindow().setShadow(false);
</script>

<section
	on:dragstart={(e) => {
		e.preventDefault();
		tauriWindow.getCurrentWindow().startDragging();
	}}
>
	<ThemeInjector css={styleOverride} html="" />

	<DefaultNowPlaying session={currentSession} />

	<div id="debug">
		<button
			on:click={async () => {
				decorations = await tauriWindow.getCurrentWindow().isDecorated();
				tauriWindow.getCurrentWindow().setDecorations(!decorations);
			}}>{decorations ? 'Enable decorations' : 'Disable decorations'}</button
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
					tauriWindow.getCurrentWindow().close();
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

			<button
				on:click={() => {
					debugMode = debugMode;
				}}>Debug: now {debugMode ? 'on' : 'off'}</button
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
