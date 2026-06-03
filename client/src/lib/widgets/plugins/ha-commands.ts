// The Home Assistant Tauri command adapter (outer ring). Every `invoke` for the HA proxy lives
// here behind a typed function, so the source (ha-source.ts) and the settings panel (HaSettings)
// share one place that knows the command-name strings and arg shapes — and tests can mock this
// module instead of the raw Tauri bridge. The token is passed INWARD only (save/test); it is
// never returned (see ha-types.ts).

import { invoke } from '@tauri-apps/api/core';
import type { HaEntity, HaRegistry, HaStatus, HaTestResult } from './ha-types';

/** Whether HA is configured + its URL + the self-signed opt-in — NEVER the token. */
export const haConfigStatus = (): Promise<HaStatus> => invoke<HaStatus>('ha_config_status');

/** Persist `plugins/ha.json`. A blank `token` keeps the previously-saved one (write-only field). */
export const saveHaConfig = (
	url: string,
	token: string,
	insecure: boolean,
	basePath: string
): Promise<void> => invoke('save_ha_config', { url, token, insecure, basePath });

/** Start the streaming WS task iff configured (idempotent — a second call while running is a no-op). */
export const haConnect = (): Promise<void> => invoke('ha_connect');

/** Stop the streaming WS task (if any). */
export const haDisconnect = (): Promise<void> => invoke('ha_disconnect');

/** The HA entities (REST `/api/states`) for the inspector's sensor dropdown. */
export const listHaEntities = (): Promise<HaEntity[]> => invoke<HaEntity[]>('list_ha_entities');

/** The HA registries (areas/devices/entities) over a short-lived WS, for the device browser. */
export const haRegistrySnapshot = (): Promise<HaRegistry> =>
	invoke<HaRegistry>('ha_registry_snapshot');

/** Validate an UNSAVED url/token/insecure combo via the WS auth handshake (returns HA version). */
export const haTestConnection = (
	url: string,
	token: string,
	insecure: boolean,
	basePath: string
): Promise<HaTestResult> =>
	invoke<HaTestResult>('ha_test_connection', { url, token, insecure, basePath });

/** Call an HA service (REST `POST /api/services/<domain>/<service>`). */
export const haCallService = (
	domain: string,
	service: string,
	data: Record<string, unknown>
): Promise<unknown> => invoke('ha_call_service', { domain, service, data });
