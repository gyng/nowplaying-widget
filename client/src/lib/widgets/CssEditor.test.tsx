import { describe, expect, it } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import CssEditor from './CssEditor';

// Smoke tests: the lazy CodeMirror impl must construct under happy-dom and render the document.
// (CssEditor is a Suspense boundary, so we await the chunk.) Rich interactions (typing, autocomplete
// popups) need real layout and are covered by the pure cssEditorLint / cssComplete tests + build.
describe('CssEditor', () => {
	it('lazily mounts a CodeMirror editor and renders the value', async () => {
		const { container } = render(<CssEditor value=".value { color: red }" />);
		await waitFor(() => expect(container.querySelector('.cm-editor')).toBeTruthy());
		expect(container.querySelector('.cm-content')?.textContent).toContain('color: red');
	});

	it('exposes the aria-label on the editable content', async () => {
		const { container } = render(<CssEditor value="" ariaLabel="widget css" />);
		await waitFor(() =>
			expect(container.querySelector('.cm-content')?.getAttribute('aria-label')).toBe('widget css')
		);
	});
});
