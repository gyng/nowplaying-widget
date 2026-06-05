// The stocks Tauri command adapter (outer ring) — every `invoke` behind a typed function, so the
// source + settings panel share the command-name strings and tests can mock this module.

import { invoke } from '@tauri-apps/api/core';
import type { StocksStatus } from './stocks-types';

export type StocksConfigInput = {
	provider: string;
	symbols: string[];
	pollSeconds: number;
};

/** The (non-secret) config. */
export const stocksConfigStatus = (): Promise<StocksStatus> =>
	invoke<StocksStatus>('stocks_config_status');

/** Persist `plugins/stocks.json`. */
export const saveStocksConfig = (cfg: StocksConfigInput): Promise<void> =>
	invoke('save_stocks_config', { ...cfg });

/** Start the poll task iff configured (idempotent). */
export const stocksConnect = (): Promise<void> => invoke('stocks_connect');

/** Stop the poll task (if any). */
export const stocksDisconnect = (): Promise<void> => invoke('stocks_disconnect');
