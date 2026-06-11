// The plugin-package Tauri command adapter (outer ring) — every `invoke` behind a typed function,
// so the packages module shares the command-name strings and tests can mock this module. Both
// commands are dumb file I/O on the app-config `plugins/` dir (command.rs); failures degrade to
// empty/null so a broken folder can never take the studio down.

import { invoke } from '@tauri-apps/api/core';
import { COMMANDS } from '../../bridge/contract';

/** One discovered `plugins/<id>/plugin.json`: the directory name + the raw, unparsed manifest. */
export type PluginPackageFile = { id: string; manifest: string };

/** Every package directory with a manifest, sorted by id. [] when none / on failure. */
export async function listPluginPackages(): Promise<PluginPackageFile[]> {
	try {
		return await invoke<PluginPackageFile[]>(COMMANDS.listPluginPackages);
	} catch (err) {
		console.warn('list_plugin_packages failed', err);
		return [];
	}
}

/** The contents of `plugins/<id>/<name>` (a manifest-declared .css/.json asset), or null. */
export async function readPluginPackageAsset(id: string, name: string): Promise<string | null> {
	try {
		return await invoke<string | null>(COMMANDS.readPluginPackageAsset, { id, name });
	} catch (err) {
		console.warn('read_plugin_package_asset failed', err);
		return null;
	}
}
