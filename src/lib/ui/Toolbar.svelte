<script lang="ts">
	import type { Snippet } from 'svelte';
	let { children }: { children: Snippet } = $props();
</script>

<div class="toolbar">{@render children()}</div>

<style>
	.toolbar {
		flex: none;
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--sp-3);
		padding: var(--sp-3) var(--sp-4);
		border-bottom: var(--bw) solid var(--line);
	}
</style>
