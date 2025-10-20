<script lang="ts">
	import { invoke } from '@tauri-apps/api/core';
	import { getVersion } from '@tauri-apps/api/app';
	import * as tauriWindow from '@tauri-apps/api/window';
	import * as tauriEvent from '@tauri-apps/api/event';
	import {
		defaultState,
		type SessionRecord,
		type MonitorInfo,
		type SavedPosition,
		handleInitialize,
		handleUpdate,
		handleDelete
	} from '../../../stores/stores';
	import { mediaStore } from '../../../stores/stores';
	import DefaultNowPlaying from './themes/DefaultNowPlaying.svelte';
	import { sortSessionsByPriority } from './priority';
	import ThemeInjector from './themes/ThemeInjector.svelte';
	import {
		getCurrentMonitorInfo,
		monitorToInfo,
		findMonitorByMatch,
		centerWindowOnMonitor,
		moveWindowTo,
		getCurrentWindowBounds,
		getNextMonitor,
		validatePosition
	} from '../../utils/monitor';
	import { onMount } from 'svelte';

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
	let statusMessage = '';
	let preferredMonitor: MonitorInfo | null = null;
	let savedPosition: SavedPosition | null = null;
	let restoreToSavedPosition = false;

	mediaStore.subscribe((store) => {
		const orderedSession = sortSessionsByPriority(store.sessions, store.sourcePriority);
		currentSession = orderedSession.at(0);

		debug('currentSession', currentSession);
		sourcePriority = store.sourcePriority;
		styleOverride = store.styleOverride;
		preferredMonitor = store.preferredMonitor;
		savedPosition = store.savedPosition;
		restoreToSavedPosition = store.restoreToSavedPosition;
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		allMedia = Object.entries(store.sessions).map(([_k, v]) => ({
			source: v.source,
			title: v.last_model_update?.Model?.media?.title
		}));
	});

	getVersion().then((v) => {
		appVersion = v;
	});

	// window-state plugin doesn't seem to save decoration state, so default to false
	let decorations = false;
	tauriWindow.getCurrentWindow().setDecorations(false);

	// setShadow(false) doesn't work on Windows!
	// Set to false in tauri.conf.json app.windows.shadow
	// https://v2.tauri.app/reference/javascript/api/namespacewindow/#setshadow
	tauriWindow.getCurrentWindow().setShadow(false);

	// Monitor management functions
	function showStatus(message: string, duration = 3000) {
		statusMessage = message;
		console.log('[Monitor]', message);
		if (duration > 0) {
			setTimeout(() => {
				statusMessage = '';
			}, duration);
		}
	}

	async function restoreToPreferredMonitor() {
		try {
			if (!preferredMonitor) {
				debug('No preferred monitor saved');
				return;
			}

			const monitor = await findMonitorByMatch(preferredMonitor);
			if (!monitor) {
				showStatus('Preferred monitor not found, staying on current monitor');
				return;
			}

			const currentMonitor = await getCurrentMonitorInfo();
			if (currentMonitor && currentMonitor.name === monitor.name) {
				debug('Already on preferred monitor');
				return;
			}

			// Get current window size
			const bounds = await getCurrentWindowBounds();

			// Calculate centered position on preferred monitor
			const newPos = centerWindowOnMonitor(monitor, bounds.width, bounds.height);

			// Move to preferred monitor
			await moveWindowTo(newPos.x, newPos.y);
			showStatus(`Moved to preferred monitor: ${monitor.name ?? 'Unknown'}`);
		} catch (err) {
			console.error('Failed to restore to preferred monitor:', err);
		}
	}

	async function handleMoveToMonitor() {
		try {
			const nextMonitor = await getNextMonitor();
			if (!nextMonitor) {
				showStatus('No other monitors available');
				return;
			}

			const bounds = await getCurrentWindowBounds();
			const newPos = centerWindowOnMonitor(nextMonitor, bounds.width, bounds.height);

			await moveWindowTo(newPos.x, newPos.y);

			// Update preferred monitor in store
			const monitorInfo = monitorToInfo(nextMonitor);
			mediaStore.update((store) => ({
				...store,
				preferredMonitor: monitorInfo
			}));

			showStatus(`Moved to monitor: ${nextMonitor.name ?? 'Unknown'}`);
		} catch (err) {
			console.error('Failed to move to next monitor:', err);
			showStatus('Error: Failed to move to monitor');
		}
	}

	async function handleSavePosition() {
		try {
			const bounds = await getCurrentWindowBounds();
			const monitor = await getCurrentMonitorInfo();

			const position = {
				x: bounds.x,
				y: bounds.y,
				width: bounds.width,
				height: bounds.height,
				timestamp: Date.now()
			};

			mediaStore.update((store) => ({
				...store,
				savedPosition: position,
				preferredMonitor: monitor ? monitorToInfo(monitor) : null
			}));

			showStatus('Position saved!');
		} catch (err) {
			console.error('Failed to save position:', err);
			showStatus('Error: Failed to save position');
		}
	}

	async function handleRestorePosition() {
		try {
			if (!savedPosition) {
				showStatus('No saved position found');
				return;
			}

			// Validate position is still on-screen
			const isValid = await validatePosition(
				savedPosition.x,
				savedPosition.y,
				savedPosition.width,
				savedPosition.height
			);

			if (!isValid) {
				showStatus('Saved position is off-screen (monitor may have been removed)');
				return;
			}

			await moveWindowTo(savedPosition.x, savedPosition.y);
			showStatus('Position restored!');
		} catch (err) {
			console.error('Failed to restore position:', err);
			showStatus('Error: Failed to restore position');
		}
	}

	// On component mount, restore position based on user preference
	onMount(async () => {
		try {
			if (restoreToSavedPosition && savedPosition) {
				// User wants to restore to saved position: use our manual restore
				// Wait a bit for the window-state plugin to finish, then override it
				await new Promise((resolve) => setTimeout(resolve, 100));

				// Validate saved position is still on-screen
				const isValid = await validatePosition(
					savedPosition.x,
					savedPosition.y,
					savedPosition.width,
					savedPosition.height
				);

				if (isValid) {
					await moveWindowTo(savedPosition.x, savedPosition.y);
					debug('Restored to saved position:', savedPosition);
					showStatus('Restored to saved position', 2000);
				} else {
					debug('Saved position is off-screen, using plugin restoration');
					showStatus('Saved position off-screen, using default', 2000);
				}
			} else {
				// User wants to use plugin restoration (default behavior)
				// Just track the current monitor after plugin finishes
				await new Promise((resolve) => setTimeout(resolve, 100));

				const currentMonitor = await getCurrentMonitorInfo();
				if (currentMonitor && !preferredMonitor) {
					// First time: save current monitor as preferred
					mediaStore.update((store) => ({
						...store,
						preferredMonitor: monitorToInfo(currentMonitor)
					}));
					debug('Saved initial monitor as preferred');
				} else if (preferredMonitor) {
					// Restore to preferred monitor if different
					await restoreToPreferredMonitor();
				}
			}
		} catch (err) {
			console.error('Failed to initialize position tracking:', err);
		}
	});
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
		{#if statusMessage}
			<div class="status-message">{statusMessage}</div>
		{/if}

		<button
			on:click={async () => {
				decorations = await tauriWindow.getCurrentWindow().isDecorated();
				tauriWindow.getCurrentWindow().setDecorations(!decorations);
			}}>Toggle decorations</button
		>

		<details>
			<summary>Monitor Controls</summary>
			<div class="button-group">
				<button on:click={handleMoveToMonitor}>Move to Different Monitor</button>
				<button on:click={handleSavePosition}>Save Position</button>
				<button on:click={handleRestorePosition} disabled={!savedPosition}>Restore Position</button>
			</div>
			<label class="checkbox-label">
				<input
					type="checkbox"
					checked={restoreToSavedPosition}
					on:change={(ev) => {
						mediaStore.update((store) => ({
							...store,
							restoreToSavedPosition: ev.currentTarget.checked
						}));
					}}
				/>
				<span>Restore to saved position on startup</span>
			</label>
			<div class="monitor-details">
				<div class="monitor-section">
					<strong>Preferred Monitor:</strong>
					{#if preferredMonitor}
						<div class="monitor-info">Name: {preferredMonitor.name ?? 'Unknown'}</div>
						<div class="monitor-info">
							Position: {preferredMonitor.position.x}, {preferredMonitor.position.y}
						</div>
						<div class="monitor-info">
							Size: {preferredMonitor.size.width}x{preferredMonitor.size.height}
						</div>
					{:else}
						<div class="monitor-info">Not set</div>
					{/if}
				</div>
				<div class="monitor-section">
					<strong>Saved Position:</strong>
					{#if savedPosition}
						<div class="monitor-info">
							Position: {savedPosition.x}, {savedPosition.y}
						</div>
						<div class="monitor-info">
							Size: {savedPosition.width}x{savedPosition.height}
						</div>
						<div class="monitor-info">
							Saved: {new Date(savedPosition.timestamp).toLocaleString()}
						</div>
					{:else}
						<div class="monitor-info">Not saved</div>
					{/if}
				</div>
			</div>
		</details>

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
		max-width: 400px;
	}

	#debug:hover {
		opacity: 1;
	}

	details {
		cursor: pointer;
		user-select: none;
	}

	.status-message {
		background: #4caf50;
		color: white;
		padding: 5px;
		border-radius: 3px;
		font-weight: bold;
		text-align: center;
		animation: fadeIn 0.3s;
	}

	.button-group {
		display: flex;
		flex-direction: column;
		gap: 3px;
		margin-bottom: 10px;
	}

	.checkbox-label {
		display: flex;
		align-items: center;
		gap: 5px;
		font-size: 12px;
		margin: 8px 0;
		cursor: pointer;
		user-select: none;
	}

	.checkbox-label input[type='checkbox'] {
		cursor: pointer;
	}

	.checkbox-label span {
		color: #333;
	}

	.monitor-details {
		display: flex;
		flex-direction: column;
		gap: 10px;
		font-size: 12px;
	}

	.monitor-section {
		border-left: 2px solid #ddd;
		padding-left: 8px;
	}

	.monitor-section strong {
		display: block;
		margin-bottom: 3px;
		color: #333;
	}

	.monitor-info {
		font-size: 11px;
		color: #666;
		margin: 2px 0;
		padding-left: 8px;
	}

	button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}
</style>
