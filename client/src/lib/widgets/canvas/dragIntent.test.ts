import { describe, expect, it } from 'vitest';
import { dragMoveIntent } from './dragIntent';

describe('dragMoveIntent', () => {
	it('left button starts a normal move-drag that may dock', () => {
		expect(dragMoveIntent(0)).toEqual({ start: true, skipFlow: false });
	});

	it('right button starts a free-move drag that skips docking', () => {
		expect(dragMoveIntent(2)).toEqual({ start: true, skipFlow: true });
	});

	it('middle and other buttons do not start a move-drag (reserved)', () => {
		expect(dragMoveIntent(1)).toBeNull();
		expect(dragMoveIntent(3)).toBeNull();
		expect(dragMoveIntent(4)).toBeNull();
	});
});
