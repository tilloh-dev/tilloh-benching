<script lang="ts">
	import Icon from './Icon.svelte';
	/** BenchyOS mark: the pixel bench. Neutral — the accent is reserved for actions. */
	let { size = 12 }: { size?: number } = $props();
</script>

<Icon name="bench" {size} class="logo" />
