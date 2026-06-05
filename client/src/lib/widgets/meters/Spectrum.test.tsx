import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Spectrum from './Spectrum';
import { SpectrumContext } from '../spectrumContext';
import type { SpectrumSource } from '../../audio/source';

afterEach(cleanup);

function fakeSource() {
	const release = vi.fn();
	const acquire = vi.fn(() => release);
	const src: SpectrumSource = {
		acquire,
		onFrame: () => () => undefined,
		latestFrame: () => null
	};
	return { src, acquire, release };
}

describe('Spectrum', () => {
	it('acquires the source on mount and releases it on unmount', () => {
		const { src, acquire, release } = fakeSource();
		const { container, unmount } = render(
			<SpectrumContext.Provider value={src}>
				<Spectrum mode="bars" bars={32} />
			</SpectrumContext.Provider>
		);
		// Renders a canvas and takes exactly one stream subscription.
		expect(container.querySelector('canvas')).toBeTruthy();
		expect(acquire).toHaveBeenCalledTimes(1);
		expect(release).not.toHaveBeenCalled();

		unmount();
		expect(release).toHaveBeenCalledTimes(1);
	});

	it('still renders a canvas (and does not crash) when no source is provided', () => {
		const { container } = render(<Spectrum />);
		expect(container.querySelector('canvas')).toBeTruthy();
	});
});
