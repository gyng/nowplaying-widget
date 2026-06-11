// Third-party plugin packages (Phase 1): a package is a directory in the app-config `plugins/`
// folder — `plugins/<id>/plugin.json` — containing ONLY declarative data: metadata + templates
// (layout trees + ParamSpec params, the same data the templates system already speaks) + an
// optional theme CSS file. No JS in Phase 1. This module is the PURE half: manifest parse +
// validation (fail-closed — a malformed manifest is rejected with a reason, a malformed template
// is dropped with a reason, nothing ever throws) and the mapping onto core/templates `Template`s.
// The Tauri file I/O + enable/registration live in widgets/plugins/packages.ts (the adapter).
// Co-located vitest tests in pluginPackage.test.ts.

import type { LayoutNode, ParamChoice, ParamSpec } from './layoutTree';
import { parseLayoutNode } from './migration';
import type { Template } from './templates';

/** One declarative template inside a package: the same shape as a built-in `Template`, except the
 * tree is DATA (a layout-node JSON, validated through the layout file's structural whitelist)
 * rather than a builder function. */
export type PackageTemplate = {
	id: string;
	name: string;
	description?: string;
	size: { w: number; h: number };
	params?: ParamSpec[];
	tree: LayoutNode;
};

/** An optional theme the package ships: `file` names a sibling `.css` asset inside the package
 * directory (read via `read_plugin_package_asset`, scanned by core/cssThreats before injection). */
export type PackageTheme = { name: string; file: string };

export type PluginPackageManifest = {
	manifestVersion: 1;
	id: string;
	name: string;
	version: string;
	description?: string;
	author?: string;
	homepage?: string;
	/** Already filtered to the structurally valid templates (invalid ones land in `warnings`). */
	templates: PackageTemplate[];
	theme?: PackageTheme;
};

export type ParsedPackage = {
	manifest: PluginPackageManifest;
	/** Dropped-template / dropped-theme reasons — the package still loads without them. */
	warnings: string[];
};

export type PackageParseResult = { ok: true; pkg: ParsedPackage } | { ok: false; reason: string };

// Mirrors the Rust `valid_name` allowlist (command.rs): 1–64 chars of [A-Za-z0-9 _-], no
// leading/trailing space. Package + template ids become path segments / registry keys.
function isIdToken(v: unknown): v is string {
	return (
		typeof v === 'string' &&
		v.length >= 1 &&
		v.length <= 64 &&
		v === v.trim() &&
		/^[A-Za-z0-9 _-]+$/.test(v)
	);
}

// An asset filename the backend will serve: `<id token>.css` / `<id token>.json` (single segment,
// no extra dots). Mirrors the Rust `valid_asset_name`.
function isAssetName(v: unknown): v is string {
	if (typeof v !== 'string') return false;
	const dot = v.lastIndexOf('.');
	if (dot <= 0) return false;
	const ext = v.slice(dot + 1).toLowerCase();
	return (ext === 'css' || ext === 'json') && isIdToken(v.slice(0, dot));
}

function isOptionalString(v: unknown): v is string | undefined {
	return v === undefined || typeof v === 'string';
}

function isSize(v: unknown): v is { w: number; h: number } {
	if (typeof v !== 'object' || v === null) return false;
	const o = v as Record<string, unknown>;
	return (
		typeof o.w === 'number' &&
		typeof o.h === 'number' &&
		Number.isFinite(o.w) &&
		Number.isFinite(o.h) &&
		o.w > 0 &&
		o.h > 0
	);
}

// A param target is a dotted path written into the cloned tree by solve.ts `applyParams`. Its
// setter is already fail-closed against auto-vivification, but a hostile path could still walk
// `__proto__`/`constructor` up into shared prototypes — reject those segments outright.
const FORBIDDEN_PATH_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);

function isSafePath(v: unknown): v is string {
	if (typeof v !== 'string' || !v.length) return false;
	return v.split('.').every((seg) => seg.length > 0 && !FORBIDDEN_PATH_SEGMENTS.has(seg));
}

function isParamChoice(v: unknown): v is ParamChoice {
	if (typeof v !== 'object' || v === null) return false;
	const o = v as Record<string, unknown>;
	return typeof o.value === 'string' && typeof o.label === 'string';
}

// One ParamSpec, structurally whitelisted (the persistence convention: only listed fields
// survive). Null = malformed → the whole template is dropped (fail-closed; a silently mangled
// param would mis-write config at insert time).
function parseParamSpec(raw: unknown): ParamSpec | null {
	if (typeof raw !== 'object' || raw === null) return null;
	const o = raw as Record<string, unknown>;
	if (typeof o.key !== 'string' || !o.key.length || !isSafePath(o.key)) return null;
	if (!isOptionalString(o.label)) return null;
	if (o.target !== undefined && !isSafePath(o.target)) return null;
	if (o.targets !== undefined && !(Array.isArray(o.targets) && o.targets.every(isSafePath))) {
		return null;
	}
	if (o.choices !== undefined && !(Array.isArray(o.choices) && o.choices.every(isParamChoice))) {
		return null;
	}
	const spec: ParamSpec = { key: o.key };
	if (o.label !== undefined) spec.label = o.label;
	if (o.default !== undefined) spec.default = o.default;
	if (o.target !== undefined) spec.target = o.target as string;
	if (o.targets !== undefined) spec.targets = (o.targets as string[]).slice();
	if (o.choices !== undefined) spec.choices = (o.choices as ParamChoice[]).map((c) => ({ ...c }));
	return spec;
}

// One template entry → PackageTemplate, or a human-readable drop reason.
function parsePackageTemplate(raw: unknown, index: number): PackageTemplate | string {
	const at = (id?: string) => `template ${id ? `"${id}"` : `#${index}`} dropped`;
	if (typeof raw !== 'object' || raw === null) return `${at()}: not an object`;
	const o = raw as Record<string, unknown>;
	if (!isIdToken(o.id)) return `${at()}: missing/invalid "id"`;
	const id = o.id;
	if (typeof o.name !== 'string' || !o.name.trim()) return `${at(id)}: missing "name"`;
	if (!isOptionalString(o.description)) return `${at(id)}: "description" must be a string`;
	if (!isSize(o.size)) return `${at(id)}: "size" must be { w, h } with positive numbers`;
	let params: ParamSpec[] | undefined;
	if (o.params !== undefined) {
		if (!Array.isArray(o.params)) return `${at(id)}: "params" must be an array`;
		params = [];
		for (const p of o.params) {
			const spec = parseParamSpec(p);
			if (spec === null) return `${at(id)}: malformed param spec`;
			params.push(spec);
		}
	}
	const tree = parseLayoutNode(o.tree);
	if (tree === null) return `${at(id)}: "tree" is not a valid layout node`;
	const size = o.size as { w: number; h: number };
	return {
		id,
		name: o.name,
		...(o.description !== undefined ? { description: o.description as string } : {}),
		size: { w: size.w, h: size.h },
		...(params && params.length ? { params } : {}),
		tree
	};
}

function parsePackageTheme(raw: unknown): PackageTheme | string {
	if (typeof raw !== 'object' || raw === null) return 'theme dropped: not an object';
	const o = raw as Record<string, unknown>;
	if (typeof o.name !== 'string' || !o.name.trim()) return 'theme dropped: missing "name"';
	if (!isAssetName(o.file) || !(o.file as string).toLowerCase().endsWith('.css')) {
		return 'theme dropped: "file" must be a plain <name>.css filename inside the package';
	}
	return { name: o.name, file: o.file as string };
}

/**
 * Parse + validate one raw `plugin.json` against the directory id the backend listed it under.
 * Fail-closed: a structural problem with the manifest itself rejects the whole package (with a
 * reason for the Plugins panel), while an individually malformed template or theme is DROPPED
 * with a reason in `warnings` and the rest of the package still loads. Never throws.
 */
export function parsePluginPackage(dirId: string, raw: string): PackageParseResult {
	const fail = (reason: string): PackageParseResult => ({ ok: false, reason });
	let json: unknown;
	try {
		json = JSON.parse(raw);
	} catch {
		return fail('plugin.json is not valid JSON');
	}
	if (typeof json !== 'object' || json === null || Array.isArray(json)) {
		return fail('manifest must be a JSON object');
	}
	const o = json as Record<string, unknown>;
	if (o.manifestVersion !== 1) {
		return fail(`unsupported manifestVersion ${JSON.stringify(o.manifestVersion)} (expected 1)`);
	}
	if (!isIdToken(o.id)) return fail('missing/invalid "id"');
	if (o.id !== dirId) return fail(`manifest id "${o.id}" does not match its folder "${dirId}"`);
	if (typeof o.name !== 'string' || !o.name.trim()) return fail('missing "name"');
	if (typeof o.version !== 'string' || !o.version.trim()) return fail('missing "version"');
	if (!isOptionalString(o.description)) return fail('"description" must be a string');
	if (!isOptionalString(o.author)) return fail('"author" must be a string');
	if (!isOptionalString(o.homepage)) return fail('"homepage" must be a string');

	const warnings: string[] = [];
	const templates: PackageTemplate[] = [];
	if (o.templates !== undefined) {
		if (!Array.isArray(o.templates)) return fail('"templates" must be an array');
		const seen = new Set<string>();
		o.templates.forEach((t, i) => {
			const parsed = parsePackageTemplate(t, i);
			if (typeof parsed === 'string') {
				warnings.push(parsed);
				return;
			}
			if (seen.has(parsed.id)) {
				warnings.push(`template "${parsed.id}" dropped: duplicate id`);
				return;
			}
			seen.add(parsed.id);
			templates.push(parsed);
		});
	}

	let theme: PackageTheme | undefined;
	if (o.theme !== undefined) {
		const parsed = parsePackageTheme(o.theme);
		if (typeof parsed === 'string') warnings.push(parsed);
		else theme = parsed;
	}

	const manifest: PluginPackageManifest = {
		manifestVersion: 1,
		id: o.id,
		name: o.name,
		version: o.version,
		...(o.description !== undefined ? { description: o.description as string } : {}),
		...(o.author !== undefined ? { author: o.author as string } : {}),
		...(o.homepage !== undefined ? { homepage: o.homepage as string } : {}),
		templates,
		...(theme ? { theme } : {})
	};
	return { ok: true, pkg: { manifest, warnings } };
}

// ---- remote-install provenance (Phase 3) --------------------------------------------------------
// `install_plugin_package` (command.rs) writes a `.install.json` sidecar next to the manifest:
// `{ source, ref, version, installedAt }`. The backend hands its RAW text back on
// `list_plugin_packages` (`PluginPackageFile.install`); parsing it is this pure half's job.

/** Provenance of a package installed from a URL — `source` is `owner/repo` for GitHub installs or
 * the verbatim manifest URL when `ref === 'direct'`. */
export type InstallSidecar = {
	source: string;
	ref: string;
	version: string;
	installedAt: number;
};

/**
 * Parse a raw `.install.json` sidecar. Fail-closed (null) on anything structurally off — a
 * package with an unreadable sidecar just degrades to a "local" package (no update affordances),
 * it never breaks the row. Never throws.
 */
export function parseInstallSidecar(raw: unknown): InstallSidecar | null {
	if (typeof raw !== 'string') return null;
	let json: unknown;
	try {
		json = JSON.parse(raw);
	} catch {
		return null;
	}
	if (typeof json !== 'object' || json === null || Array.isArray(json)) return null;
	const o = json as Record<string, unknown>;
	if (typeof o.source !== 'string' || !o.source.trim()) return null;
	if (typeof o.ref !== 'string' || !o.ref.trim()) return null;
	if (typeof o.version !== 'string' || !o.version.trim()) return null;
	if (typeof o.installedAt !== 'number' || !Number.isFinite(o.installedAt)) return null;
	return { source: o.source, ref: o.ref, version: o.version, installedAt: o.installedAt };
}

/** "Update available" means the remote version string DIFFERS — no semver ordering games
 * (downgrades are deliberate re-installs, so direction doesn't matter). */
export function versionsDiffer(a: string, b: string): boolean {
	return a.trim() !== b.trim();
}

/** The source string to feed back into `install_plugin_package` for an update: a pinned GitHub
 * ref must round-trip as a `/tree/<ref>` URL (plain `owner/repo` would resolve back to `main`);
 * direct URLs and default-branch installs re-use the recorded source as-is. */
export function reinstallSource(s: InstallSidecar): string {
	if (s.ref === 'direct' || s.ref === 'main') return s.source;
	return `https://github.com/${s.source}/tree/${s.ref}`;
}

/** The registry id of a package template: namespaced so two packages (or a package and a
 * built-in) can never collide — `pkg:<pkgId>:<tplId>`. */
export function packageTemplateId(pkgId: string, tplId: string): string {
	return `pkg:${pkgId}:${tplId}`;
}

/**
 * Map a parsed manifest's templates onto the core/templates `Template` shape: the data tree is
 * wrapped as `tree: () => structuredClone(node)` (every insert gets a private copy, exactly like
 * a builder-function template), params carry through, ids are namespaced via packageTemplateId.
 * Pure — registering the result is the adapter's job.
 */
export function packageTemplates(manifest: PluginPackageManifest): Template[] {
	return manifest.templates.map((t) => ({
		id: packageTemplateId(manifest.id, t.id),
		name: t.name,
		description: t.description ?? '',
		size: { ...t.size },
		...(t.params?.length ? { params: t.params } : {}),
		tree: () => structuredClone(t.tree)
	}));
}
