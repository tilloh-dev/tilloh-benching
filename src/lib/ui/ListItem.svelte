<script lang="ts">
	import type { Snippet } from 'svelte';
	let {
		active = false,
		onclick,
		children
	}: { active?: boolean; onclick: () => void; children: Snippet } = $props();
</script>

<button class="li" class:active {onclick}>{@render children()}</button>

<style>
	.li {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: var(--sp-1);
		width: 100%;
		padding: var(--sp-3) var(--sp-4);
		border: 0;
		border-bottom: var(--bw) solid var(--line-soft);
		background: transparent;
		color: var(--fg-2);
		text-align: left;
		cursor: pointer;
	}
	.li:hover {
		background: var(--hover);
		color: var(--fg);
	}
	.li.active {
		background: var(--accent-soft);
		color: var(--fg);
		box-shadow: inset 2px 0 0 var(--accent);
	}
</style>
