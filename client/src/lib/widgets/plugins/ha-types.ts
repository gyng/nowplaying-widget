// Shared TypeScript mirrors of the Home Assistant Rust structs that cross the bridge
// (widgetsack/src/ha.rs). Kept in one place so the field casing (entity_id, friendly_name,
// configured, url, insecure, ha_version) stays in lock-step with the serde output — see
// AGENTS.md §5 (type-mirroring is a domain contract). The token NEVER appears here: it is
// write-only over the bridge and is never returned to the webview.

/** One HA entity row from `list_ha_entities` (REST `/api/states`). */
export type HaEntity = {
	entity_id: string;
	state: string;
	friendly_name?: string;
	unit?: string;
};

/** Non-secret config status from `ha_config_status` — never includes the token. */
export type HaStatus = {
	configured: boolean;
	url: string | null;
	insecure: boolean;
	base_path: string;
};

/** Result of a successful `ha_test_connection` handshake. */
export type HaTestResult = {
	ha_version: string | null;
};

// Registry rows (from ha_registry_snapshot) for the area > device > entity browser. The canonical
// definitions live in core/haRegistry.ts (the pure tree builder's domain), re-exported here so the
// bridge-mirror types stay in one place. Structure + names only; device_class/unit/friendly_name
// come from the live state (HaEntity).
export type { HaArea, HaDevice, HaEntityReg, HaRegistry } from '../../core/haRegistry';
