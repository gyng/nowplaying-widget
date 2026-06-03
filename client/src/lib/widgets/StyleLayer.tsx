// Injects the assembled theme/def/instance stylesheet for a monitor (Phase 7). The string is built
// by the pure core/style.ts assembleStyles; this drops it into a <style> element. (Svelte used an
// {@html} string hack to dodge its preprocessor; React renders a real <style> via the inner HTML.)
type Props = { css?: string };

export default function StyleLayer({ css = '' }: Props) {
	return <style dangerouslySetInnerHTML={{ __html: css }} />;
}
