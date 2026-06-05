// Lazy boundary for the CSS editor. CodeMirror is studio-only, so it loads as its own chunk on first
// use — overlay windows (which render the same Canvas but never edit CSS) never parse it. Matches the
// codebase's existing split of the spectrum WASM FFT and the QuickJS formula engine. Callers use this
// exactly like a plain component; the heavy implementation lives in CssEditorImpl.
import { lazy, Suspense } from 'react';
import type { CssEditorProps } from './CssEditorImpl';
import './CssEditor.css';

const CssEditorImpl = lazy(() => import('./CssEditorImpl'));

export default function CssEditor(props: CssEditorProps) {
	// Sized placeholder during the (local-disk, sub-frame) chunk load so the layout doesn't jump.
	const fallback = (
		<div
			className={['css-editor', 'css-editor-loading', props.className].filter(Boolean).join(' ')}
			aria-busy="true"
		/>
	);
	return (
		<Suspense fallback={fallback}>
			<CssEditorImpl {...props} />
		</Suspense>
	);
}
