// Pure decision for the studio's close-with-unsaved-changes prompt, extracted so it's unit-testable
// without a window (AGENTS.md §4). `confirm` is injected (window.confirm in the app, a stub in tests).
// Two native confirms give the three meaningful outcomes without a custom modal, matching the rest of
// the studio's window.confirm style (cancelEdits / monitor-switch).

export type CloseAction = 'close' | 'save' | 'discard' | 'cancel';

export const SAVE_PROMPT = 'You have unsaved changes. Save them before closing?';
export const DISCARD_PROMPT = 'Discard your unsaved changes and close?';

/**
 * Decide what to do when the studio window is asked to close.
 * - No unsaved changes → `close` (proceed, no prompt).
 * - Save? (confirm 1) yes → `save`; no → Discard? (confirm 2) yes → `discard`; no → `cancel` (stay).
 */
export function decideStudioClose(
	hasUnsaved: boolean,
	confirm: (message: string) => boolean
): CloseAction {
	if (!hasUnsaved) return 'close';
	if (confirm(SAVE_PROMPT)) return 'save';
	if (confirm(DISCARD_PROMPT)) return 'discard';
	return 'cancel';
}
