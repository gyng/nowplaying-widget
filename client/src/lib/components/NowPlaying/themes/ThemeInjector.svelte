<script lang="ts">
	export let css: string | undefined;
	export let html: string | undefined;
</script>

<!-- Need to break up <style> to bypass svelte preprocessor picking the tag up -->
{@html `<` + `style>${css}</style>`}
{@html html}
