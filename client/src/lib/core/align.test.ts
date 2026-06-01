import { describe, expect, it } from 'vitest';
import { snapRectToPeers } from './align';

const peer = { x: 100, y: 100, w: 50, h: 50 }; // edges x:100,125,150 / y:100,125,150

describe('snapRectToPeers', () => {
	it('snaps a left edge to a peer left edge and reports a guide', () => {
		const r = snapRectToPeers({ x: 96, y: 200, w: 20, h: 20 }, [peer], 6);
		expect(r.rect.x).toBe(100);
		expect(r.guideXs).toEqual([100]);
		expect(r.rect.y).toBe(200); // nothing to snap vertically
		expect(r.guideYs).toEqual([]);
	});

	it('snaps centre-to-centre', () => {
		const r = snapRectToPeers({ x: 113, y: 200, w: 20, h: 20 }, [peer], 6);
		expect(r.rect.x + r.rect.w / 2).toBe(125); // centre aligns to peer centre
		expect(r.guideXs).toEqual([125]);
	});

	it('does not snap when every edge is outside the threshold', () => {
		const r = snapRectToPeers({ x: 160, y: 160, w: 20, h: 20 }, [peer], 6);
		expect(r.rect).toEqual({ x: 160, y: 160, w: 20, h: 20 });
		expect(r.guideXs).toEqual([]);
		expect(r.guideYs).toEqual([]);
	});

	it('picks the closest of several candidate edges', () => {
		// right edge (x+ w = 152) is 2px from peer right (150); left (148) is closer to nothing
		const r = snapRectToPeers({ x: 132, y: 96, w: 20, h: 20 }, [peer], 6);
		expect(r.rect.x + r.rect.w).toBe(150); // right edge snaps to peer right
		expect(r.guideXs).toEqual([150]);
		expect(r.rect.y).toBe(100); // top snaps to peer top
		expect(r.guideYs).toEqual([100]);
	});

	it('returns the rect unchanged with no peers', () => {
		const r = snapRectToPeers({ x: 5, y: 5, w: 10, h: 10 }, [], 6);
		expect(r.rect).toEqual({ x: 5, y: 5, w: 10, h: 10 });
	});
});
