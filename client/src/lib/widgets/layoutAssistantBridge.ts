// A module-level bridge that lets the (props-less) AI Provider settings panel drive the studio's
// editor model, mirroring the `setSolvedForFloat` ref pattern in canvas/useEditorModel.ts. Canvas
// registers an implementation on mount (studio role only); the layout-assistant UI calls the free
// functions. When no studio is mounted (overlay role / dev), the calls degrade gracefully.
import type { AssistantOp } from '../core/llm';
import type { MonitorLayout } from '../core/layoutTree';

export type LayoutAssistantResult = { applied: number; addedIds: string[]; errors: string[] };

export type LayoutAssistantApi = {
	/** The current monitor layout (for building the assistant's "current layout" context). */
	monitor(): MonitorLayout;
	/** Apply the model-proposed ops to the live editor (one undo step) and return what happened. */
	apply(ops: AssistantOp[]): LayoutAssistantResult;
};

let api: LayoutAssistantApi | null = null;

export function setLayoutAssistantApi(next: LayoutAssistantApi | null): void {
	api = next;
}

export function layoutAssistantReady(): boolean {
	return api !== null;
}

export function layoutAssistantMonitor(): MonitorLayout | null {
	return api?.monitor() ?? null;
}

export function applyLayoutAssistant(ops: AssistantOp[]): LayoutAssistantResult {
	return api?.apply(ops) ?? { applied: 0, addedIds: [], errors: ['the editor is not ready'] };
}
