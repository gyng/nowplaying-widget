// Third-party plugin packages — the orchestration half (the pure parse/validate lives in
// core/pluginPackage.ts; the raw file I/O in packages-commands.ts). Canvas calls `initPackages()`
// once per window (both roles): discover `plugins/<id>/plugin.json`, parse every manifest
// (failures become warn rows in the Plugins panel, like pluginLoadErrors), and apply the ENABLED
// ones — register their templates as a named group in the Add palette / widget designer, and
// inject their theme CSS (scanned by core/cssThreats; injected only with the user's stored
// consent). Packages are OPT-IN: the enabled list is an explicit localStorage allowlist that
// starts empty, so a freshly dropped folder registers nothing until the user flips its toggle.

import { createStore } from '../../../stores/createStore';
import { createPersistedStore } from '../../../stores/persist';
import { scanCssThreats, threatSummary } from '../../core/cssThreats';
import {
	packageTemplates,
	parseInstallSidecar,
	parsePluginPackage,
	reinstallSource,
	versionsDiffer,
	type InstallSidecar,
	type PluginPackageManifest
} from '../../core/pluginPackage';
import { registerTemplates, unregisterTemplates } from '../../core/templates';
import {
	checkPluginPackageUpdate,
	installPluginPackage,
	listPluginPackages,
	readPluginPackageAsset,
	removePluginPackage
} from './packages-commands';

// One discovered package directory: either a parsed manifest (+ drop warnings) or a parse error.
type Discovered = {
	id: string;
	manifest: PluginPackageManifest | null;
	error: string | null;
	warnings: string[];
	/** Provenance when installed from a URL (the `.install.json` sidecar); null = hand-dropped. */
	install: InstallSidecar | null;
};

/** What the Plugins panel renders per package row. */
export type PackageRow = {
	id: string;
	name: string; // manifest name, or the bare folder id when the manifest failed to parse
	version: string;
	description?: string;
	/** Manifest parse failure (→ warn dot + reason, no toggle). Null when parsed. */
	error: string | null;
	/** Dropped-template / dropped-theme reasons (→ warn dot, still toggleable). */
	warnings: string[];
	templates: number;
	themeName: string | null;
	/** The install source (`owner/repo` or a URL) when installed via `installPackage`; null for a
	 * hand-dropped folder (no update-check affordance — there's nowhere to check against). */
	installedFrom: string | null;
	/** The version recorded at install time (usually equals `version` from the manifest). */
	installedVersion?: string;
};

const parseIds = (raw: unknown): string[] =>
	Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];

/** The opt-in allowlist of enabled package ids (default: nothing enabled). */
export const enabledPackages = createPersistedStore<string[]>(
	'widgetsack.packages.enabled',
	parseIds
);

// Packages whose threat-flagged theme CSS the user explicitly accepted (the first-enable
// confirm). Without this consent a threat-flagged theme is never injected, even when enabled.
const trustedCssPackages = createPersistedStore<string[]>(
	'widgetsack.packages.cssTrusted',
	parseIds
);

/** The discovered package rows, for the Plugins panel (subscribe via useStore). */
export const packagesStore = createStore<PackageRow[]>([]);

const discovered = new Map<string, Discovered>();

function rowOf(d: Discovered): PackageRow {
	return {
		id: d.id,
		name: d.manifest?.name ?? d.id,
		version: d.manifest?.version ?? '',
		...(d.manifest?.description !== undefined ? { description: d.manifest.description } : {}),
		error: d.error,
		warnings: d.warnings.slice(),
		templates: d.manifest?.templates.length ?? 0,
		themeName: d.manifest?.theme?.name ?? null,
		installedFrom: d.install?.source ?? null,
		...(d.install ? { installedVersion: d.install.version } : {})
	};
}

function publishRows(): void {
	packagesStore.set(Array.from(discovered.values(), rowOf));
}

// ---- theme injection ---------------------------------------------------------------------------
// A package theme is a plain <style> tag per package (data-pkg-theme="<id>") in THIS window's
// head — independent of the user's selected theme, removed on disable. Injected only when the
// scan is clean or the user stored consent at enable time.

function removePackageTheme(id: string): void {
	document.querySelector(`style[data-pkg-theme="${CSS.escape(id)}"]`)?.remove();
}

async function injectPackageTheme(d: Discovered): Promise<void> {
	const theme = d.manifest?.theme;
	if (!theme) return;
	const css = await readPluginPackageAsset(d.id, theme.file);
	if (css == null) return;
	if (scanCssThreats(css).length && !trustedCssPackages.getSnapshot().includes(d.id)) return;
	removePackageTheme(d.id);
	const el = document.createElement('style');
	el.setAttribute('data-pkg-theme', d.id);
	el.textContent = css;
	document.head.appendChild(el);
}

// ---- registration ------------------------------------------------------------------------------

// Apply one package's enabled state: register/unregister its template group (keyed by the
// package's display name — that's the heading the palette shows) and add/remove its theme style.
async function applyPackage(d: Discovered, enabled: boolean): Promise<void> {
	if (!d.manifest) return; // unparsed packages register nothing
	if (enabled) {
		if (d.manifest.templates.length) {
			registerTemplates(d.manifest.name, packageTemplates(d.manifest));
		}
		await injectPackageTheme(d);
	} else {
		unregisterTemplates(d.manifest.name);
		removePackageTheme(d.id);
	}
}

/**
 * (Re)discover the package directories and re-apply the enabled ones. Called at init and when
 * the Plugins panel opens (so a freshly dropped folder shows up without a restart). A package
 * that vanished from disk keeps nothing registered (its group is unregistered below).
 */
export async function refreshPackages(): Promise<void> {
	const files = await listPluginPackages();
	// Unregister groups for packages that disappeared since the last scan.
	const liveIds = new Set(files.map((f) => f.id));
	for (const [id, d] of discovered) {
		if (!liveIds.has(id)) void applyPackage(d, false);
	}
	discovered.clear();
	for (const f of files) {
		const result = parsePluginPackage(f.id, f.manifest);
		const install = parseInstallSidecar(f.install);
		discovered.set(
			f.id,
			result.ok
				? {
						id: f.id,
						manifest: result.pkg.manifest,
						error: null,
						warnings: result.pkg.warnings,
						install
				  }
				: { id: f.id, manifest: null, error: result.reason, warnings: [], install }
		);
	}
	publishRows();
	const enabled = new Set(enabledPackages.getSnapshot());
	for (const d of discovered.values()) {
		if (enabled.has(d.id)) await applyPackage(d, true);
	}
}

let initialized = false;

/** One-shot init per window (Canvas mount, both roles — idempotent like registerBuiltinPlugins). */
export async function initPackages(): Promise<void> {
	if (initialized) return;
	initialized = true;
	await refreshPackages();
}

/**
 * Flip one package's enabled state, LIVE (templates appear in / vanish from the palette without
 * a reload; the theme style tag follows). On the FIRST enable of a package whose theme CSS scans
 * with threats, `confirmCssThreats` is asked with a human summary (the Plugins panel passes a
 * window.confirm mirroring the sack-import wording); declining aborts the enable. Consent is
 * stored, so subsequent boots inject without asking again. Other windows (overlays) pick the
 * change up on their next reload — the allowlist is shared localStorage.
 */
export async function togglePackage(
	id: string,
	enabled: boolean,
	confirmCssThreats: (summary: string) => boolean = () => true
): Promise<void> {
	const d = discovered.get(id);
	if (!d?.manifest) return; // unknown / unparsed → not toggleable
	if (enabled && d.manifest.theme && !trustedCssPackages.getSnapshot().includes(id)) {
		const css = await readPluginPackageAsset(id, d.manifest.theme.file);
		const threats = css ? scanCssThreats(css) : [];
		if (threats.length) {
			if (!confirmCssThreats(threatSummary(threats))) return;
			trustedCssPackages.update((ids) => [...ids, id]);
		}
	}
	enabledPackages.update((ids) => {
		const without = ids.filter((x) => x !== id);
		return enabled ? [...without, id] : without;
	});
	await applyPackage(d, enabled);
}

// ---- remote install / update / remove (Phase 3) --------------------------------------------------
// All three return `{ ok, error? }` instead of throwing so the panel can window.alert the reason
// without try/catch noise. Every mutation ends in refreshPackages() — the single re-scan +
// re-apply path — so the rows, the palette groups, and the theme tags can never drift from disk.

export type PackageOpResult = { ok: boolean; error?: string };

/**
 * Install a package from `owner/repo`, a github.com repo URL, or an https plugin.json URL. The
 * backend fetches + writes the folder; the refresh re-discovers it. Fresh installs land DISABLED
 * (the opt-in allowlist is untouched) — same trust gate as a hand-dropped folder.
 */
export async function installPackage(source: string): Promise<PackageOpResult> {
	try {
		await installPluginPackage(source);
	} catch (err) {
		return { ok: false, error: String(err) };
	}
	await refreshPackages();
	return { ok: true };
}

/** What a manual update check tells the row. */
export type PackageUpdateStatus =
	| { ok: true; current: string; latest: string; updateAvailable: boolean }
	| { ok: false; error: string };

/** MANUAL update check: re-fetch just the manifest from the recorded install source and compare
 * version strings (any difference = update available; downgrades are deliberate re-installs). */
export async function checkPackageUpdate(id: string): Promise<PackageUpdateStatus> {
	try {
		const r = await checkPluginPackageUpdate(id);
		return {
			ok: true,
			current: r.current,
			latest: r.latest,
			updateAvailable: versionsDiffer(r.current, r.latest)
		};
	} catch (err) {
		return { ok: false, error: String(err) };
	}
}

/**
 * Re-install from the recorded source (a pinned ref round-trips via `reinstallSource`). The old
 * registration is dropped FIRST when the package is enabled — a renamed manifest would otherwise
 * strand its palette group under the stale name — and the closing refresh re-applies the new
 * version live.
 */
export async function updatePackage(id: string): Promise<PackageOpResult> {
	const d = discovered.get(id);
	if (!d?.install) return { ok: false, error: 'package was not installed from a URL' };
	if (enabledPackages.getSnapshot().includes(id)) await applyPackage(d, false);
	try {
		await installPluginPackage(reinstallSource(d.install));
	} catch (err) {
		await refreshPackages(); // restore the (still enabled) old version's registration
		return { ok: false, error: String(err) };
	}
	await refreshPackages();
	return { ok: true };
}

/**
 * Remove a package (works for installed AND hand-dropped folders — it's a dir delete): live-drop
 * its templates/theme, clear it from the enable allowlist AND the stored CSS consent (a future
 * re-install must re-earn trust), then delete and re-scan.
 */
export async function removePackage(id: string): Promise<PackageOpResult> {
	const d = discovered.get(id);
	if (d) await applyPackage(d, false);
	enabledPackages.update((ids) => ids.filter((x) => x !== id));
	trustedCssPackages.update((ids) => ids.filter((x) => x !== id));
	try {
		await removePluginPackage(id);
	} catch (err) {
		await refreshPackages();
		return { ok: false, error: String(err) };
	}
	await refreshPackages();
	return { ok: true };
}

/** TEST-ONLY: drop all module state so each test starts from a clean registry. */
export function resetPackagesForTest(): void {
	for (const d of discovered.values()) void applyPackage(d, false);
	discovered.clear();
	publishRows();
	enabledPackages.set([]);
	trustedCssPackages.set([]);
	initialized = false;
}
