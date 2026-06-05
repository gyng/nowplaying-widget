import { describe, expect, it, vi } from 'vitest';
import { decideStudioClose, DISCARD_PROMPT, SAVE_PROMPT } from './closePrompt';

describe('decideStudioClose', () => {
	it('closes immediately when there are no unsaved changes (no prompt)', () => {
		const confirm = vi.fn(() => true);
		expect(decideStudioClose(false, confirm)).toBe('close');
		expect(confirm).not.toHaveBeenCalled();
	});

	it('saves when the first confirm is accepted', () => {
		const confirm = vi.fn(() => true);
		expect(decideStudioClose(true, confirm)).toBe('save');
		expect(confirm).toHaveBeenCalledTimes(1);
		expect(confirm).toHaveBeenCalledWith(SAVE_PROMPT);
	});

	it('discards when save is declined but discard is accepted', () => {
		const confirm = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
		expect(decideStudioClose(true, confirm)).toBe('discard');
		expect(confirm).toHaveBeenNthCalledWith(1, SAVE_PROMPT);
		expect(confirm).toHaveBeenNthCalledWith(2, DISCARD_PROMPT);
	});

	it('cancels (stays open) when both are declined', () => {
		const confirm = vi.fn(() => false);
		expect(decideStudioClose(true, confirm)).toBe('cancel');
		expect(confirm).toHaveBeenCalledTimes(2);
	});
});
