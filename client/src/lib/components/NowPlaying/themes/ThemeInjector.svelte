<script lang="ts">
	export let css: string | undefined;
	export let html: string | undefined;
</script>

<!-- Need to break up <style> to bypass svelte preprocessor picking the tag up -->
<!-- eslint-disable-next-line svelte/no-at-html-tags -->
{@html `<` + `style>${css}</style>`}
<!-- eslint-disable-next-line svelte/no-at-html-tags -->
{@html html}
