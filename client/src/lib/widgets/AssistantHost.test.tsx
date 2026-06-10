import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';

// Stub the generation hook: the host's job is config-in → useAssistant → meter props, so the test
// pins that wiring without an LLM/telemetry runtime.
const { refresh, useAssistant } = vi.hoisted(() => {
	const refresh = vi.fn();
	return {
		refresh,
		useAssistant: vi.fn(() => ({ text: 'CPU is calm.', busy: false, error: '', refresh }))
	};
});
vi.mock('./useAssistant', () => ({ useAssistant }));

import AssistantHost from './AssistantHost';

describe('AssistantHost (container wiring)', () => {
	it('feeds the config to useAssistant and renders the meter with the generated state', () => {
		const { getByText, getByLabelText } = render(
			<AssistantHost prompt="how are things" schedule="5m" sensors="cpu.total" speak label="AI" />
		);
		expect(useAssistant).toHaveBeenCalledWith({
			prompt: 'how are things',
			schedule: '5m',
			sensors: 'cpu.total',
			speak: true
		});
		expect(getByText('CPU is calm.')).toBeTruthy();
		expect(getByText('AI')).toBeTruthy();
		fireEvent.click(getByLabelText('Generate now'));
		expect(refresh).toHaveBeenCalledOnce();
	});
});
