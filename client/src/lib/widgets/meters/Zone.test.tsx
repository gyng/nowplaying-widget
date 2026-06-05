import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import Zone from './Zone';

describe('Zone meter', () => {
	it('renders nothing on the passive overlay (editMode off)', () => {
		const { container } = render(<Zone editMode={false} matchExe="Spotify.exe" />);
		expect(container.firstChild).toBeNull();
	});

	it('renders an outline + tag while editing', () => {
		const { container, getByText } = render(<Zone editMode matchExe="Spotify.exe" />);
		expect(container.querySelector('.zone-widget')).not.toBeNull();
		expect(getByText(/zone · Spotify\.exe/)).toBeTruthy();
	});

	it('shows just "zone" when no match rule is set', () => {
		const { getByText } = render(<Zone editMode />);
		expect(getByText(/⊞ zone$/)).toBeTruthy();
	});
});
