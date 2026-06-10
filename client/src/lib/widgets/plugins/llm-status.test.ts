import { describe, expect, it } from 'vitest';
import { createTelemetryHub } from '../../core/telemetry';
import { ingestLlmStatus, llmStatusText, LLM_STATUS_SENSOR } from './llm-status';
import type { LlmStatus } from './llm-types';

const status = (over: Partial<LlmStatus> = {}): LlmStatus => ({
	configured: true,
	active: 'openai',
	providers: {},
	temperature: 0.7,
	maxTokens: 1024,
	agentControl: false,
	...over
});

const provider = (hasKey: boolean) => ({
	baseUrl: '',
	model: '',
	hasKey,
	insecure: false,
	sttModel: '',
	ttsModel: '',
	ttsVoice: ''
});

describe('llmStatusText', () => {
	it('is unconfigured when nothing is saved or no provider is active', () => {
		expect(llmStatusText(status({ configured: false }))).toBe('unconfigured');
		expect(llmStatusText(status({ active: '' }))).toBe('unconfigured');
	});

	it('is configured when the active provider has a key', () => {
		expect(llmStatusText(status({ providers: { openai: provider(true) } }))).toBe('configured');
		expect(llmStatusText(status({ providers: { openai: provider(false) } }))).toBe('unconfigured');
	});

	it('needs no key for a keyless provider (ollama)', () => {
		expect(llmStatusText(status({ active: 'ollama' }))).toBe('configured');
	});
});

describe('ingestLlmStatus', () => {
	it('pushes the readiness as a text sample on the llm.status sensor', () => {
		const hub = createTelemetryHub();
		ingestLlmStatus(hub, status({ active: 'ollama' }));
		expect(hub.sensor(LLM_STATUS_SENSOR).getSnapshot().value).toEqual({
			kind: 'text',
			value: 'configured'
		});
	});
});
