<script lang="ts">
	// Injects the assembled theme/def/instance stylesheet for a monitor (Phase 7). The
	// string is built by the pure core/style.ts assembleStyles; this drops it into a style
	// element. The opening tag is split below so Svelte's preprocessor doesn't grab it.
	export let css = '';
</script>

<!-- eslint-disable-next-line svelte/no-at-html-tags -->
{@html `<` + `style>${css}</style>`}
