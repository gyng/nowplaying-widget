import { describe, it, expect } from 'vitest';
import { decideDesignerLeave, designerLeavePrompt } from './designerLeave';

describe('decideDesignerLeave', () => {
	const never = () => {
		throw new Error('confirm should not be called');
	};

	it('leaves without asking when previewing a read-only template (nothing to save)', () => {
		expect(decideDesignerLeave({ previewing: true, dirty: true, name: 'Network' }, never)).toBe(
			'leave'
		);
	});

	it('leaves without asking when the def has no unsaved edits', () => {
		expect(decideDesignerLeave({ previewing: false, dirty: false, name: 'Clock' }, never)).toBe(
			'leave'
		);
	});

	it('leaves (saving via Done) when the user confirms the prompt', () => {
		const seen: string[] = [];
		const action = decideDesignerLeave({ previewing: false, dirty: true, name: 'Clock' }, (m) => {
			seen.push(m);
			return true;
		});
		expect(action).toBe('leave');
		expect(seen).toEqual([designerLeavePrompt('Clock')]);
	});

	it('stays in the designer when the user dismisses the prompt', () => {
		expect(
			decideDesignerLeave({ previewing: false, dirty: true, name: 'Clock' }, () => false)
		).toBe('stay');
	});

	it('names the widget in the prompt', () => {
		expect(designerLeavePrompt('My Gauge')).toContain('My Gauge');
	});
});
