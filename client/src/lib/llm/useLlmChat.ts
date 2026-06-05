// The reusable chat hook — the "AI usable across the app" surface. Any component can drive a streamed
// conversation: `send(text)` opens a user turn + a streaming assistant turn (tokens arrive over the
// `llm_delta` event into llmStore), `cancel()` aborts. The transcript is read reactively via useChat().
// Pure transcript logic lives in core/llm.ts; the Tauri calls go through llm-commands.ts.
import { useCallback, useEffect } from 'react';
import { pushUser, startTurn, toMessages, type ChatState } from '../core/llm';
import { llmStore, resetChat, useChat } from '../../stores/llmStore';
import { llmCancel, llmStream } from '../widgets/plugins/llm-commands';
import { startLlmSource } from './source';

// A monotonic counter for unique turn/request ids (no Date/Math.random needed — a stream id only has
// to be unique within the session). Module scope so ids don't collide across hook instances.
let seq = 0;

export type LlmChat = {
	chat: ChatState;
	send: (text: string) => Promise<string>;
	cancel: (requestId: string) => void;
	reset: () => void;
};

export function useLlmChat(): LlmChat {
	const chat = useChat();

	// Ensure the `llm_delta` bridge is live for the lifetime of any chat consumer. The `cancelled`
	// guard handles an unmount that races ahead of the async listen(): if we unmount before
	// startLlmSource resolves, we stop it the moment it does, so the reference count never leaks.
	useEffect(() => {
		let cancelled = false;
		let stop: (() => void) | undefined;
		startLlmSource().then((fn) => {
			if (cancelled) fn();
			else stop = fn;
		});
		return () => {
			cancelled = true;
			stop?.();
		};
	}, []);

	const send = useCallback(async (text: string): Promise<string> => {
		const trimmed = text.trim();
		if (!trimmed) return '';
		seq += 1;
		const requestId = `chat-${seq}`;
		// Append the user turn + open the streaming assistant turn (id === requestId) in one update.
		llmStore.update((s) => startTurn(pushUser(s, `u-${seq}`, trimmed), requestId));
		// Send the full prior transcript (the empty assistant turn is filtered out by toMessages).
		const messages = toMessages(llmStore.getSnapshot());
		await llmStream(requestId, messages);
		return requestId;
	}, []);

	const cancel = useCallback((requestId: string) => {
		void llmCancel(requestId);
	}, []);

	return { chat, send, cancel, reset: resetChat };
}
