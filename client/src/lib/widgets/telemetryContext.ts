// The telemetry hub provided once at the Canvas root (replaces setContext('telemetryHub', hub)).
// Held in a ref/memo by the provider so the Context value is referentially stable across renders
// (a fresh hub per render would re-subscribe every sensor and tear useSyncExternalStore).
import { createContext, useContext } from 'react';
import type { TelemetryHub } from '../core/telemetry';

export const TelemetryHubContext = createContext<TelemetryHub | null>(null);

/** Read the ambient telemetry hub. Throws if used outside the provider (a programming error). */
export function useTelemetryHub(): TelemetryHub {
	const hub = useContext(TelemetryHubContext);
	if (!hub) {
		throw new Error('useTelemetryHub: no TelemetryHubContext provider in the tree');
	}
	return hub;
}
