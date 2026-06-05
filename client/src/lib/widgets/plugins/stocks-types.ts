// TypeScript mirror of the stocks Rust structs that cross the bridge (widgetsack/src/stocks.rs).
// One place so the field casing stays in lock-step with serde (AGENTS.md §5). StocksStatus uses
// camelCase (the struct is `#[serde(rename_all = "camelCase")]`). Yahoo is keyless, so nothing here
// is secret.

/** Non-secret stocks config from `stocks_config_status`. */
export type StocksStatus = {
	configured: boolean;
	provider: string;
	symbols: string[];
	pollSeconds: number;
};
