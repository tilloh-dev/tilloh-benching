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
		gap: 8px;
		padding: 9px 12px;
		border-bottom: 1px solid var(--line-soft);
		background: linear-gradient(180deg, rgba(255, 255, 255, 0.02), transparent);
	}
</style>
