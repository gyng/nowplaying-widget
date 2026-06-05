// TypeScript mirrors of the LLM Rust structs that cross the bridge (widgetsack/src/llm.rs). One place
// so the field casing stays in lock-step with serde (AGENTS.md §5). The api_key NEVER appears here —
// it is write-only over the bridge; the UI only learns `hasKey`.

/** One provider's non-secret status (mirrors Rust `ProviderStatus`). The api_key is never sent — only
 * `hasKey`. `baseUrl` is the EFFECTIVE base (the provider default when unset). */
export type ProviderStatus = {
	baseUrl: string;
	model: string;
	hasKey: boolean;
	insecure: boolean;
	sttModel: string;
	ttsModel: string;
	ttsVoice: string;
};

/** Non-secret config status from `llm_config_status` — every configured provider keyed by id (so the UI
 * can switch the active provider without losing the others), the active selection, and global params. */
export type LlmStatus = {
	configured: boolean;
	active: string;
	providers: Record<string, ProviderStatus>;
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

/** Synthesized speech bytes + mime from `llm_synthesize` (mirrors Rust `LlmAudio`). `audio` arrives as a
 * plain number[] over the bridge. */
export type LlmAudio = {
	audio: number[];
	mime: string;
};
