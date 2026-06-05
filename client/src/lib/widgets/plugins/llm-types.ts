// TypeScript mirrors of the LLM Rust structs that cross the bridge (widgetsack/src/llm.rs). One place
// so the field casing stays in lock-step with serde (AGENTS.md §5). The api_key NEVER appears here —
// it is write-only over the bridge; the UI only learns `hasKey`.

/** Non-secret config status from `llm_config_status` — never the api_key. camelCase (serde rename_all). */
export type LlmStatus = {
	configured: boolean;
	provider: string;
	baseUrl: string;
	model: string;
	hasKey: boolean;
	temperature: number;
	maxTokens: number;
	agentControl: boolean;
};

/** Result of a successful `llm_test_connection`. */
export type LlmTestResult = {
	model: string;
	reply: string;
};

/** One selectable model from `llm_list_models`. */
export type LlmModel = {
	id: string;
	label: string;
};
