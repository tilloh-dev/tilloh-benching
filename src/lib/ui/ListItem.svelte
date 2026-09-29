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
		gap: 3px;
		width: 100%;
		padding: 9px 12px;
		border: 0;
		border-bottom: 1px solid var(--line-soft);
		background: transparent;
		text-align: left;
		cursor: pointer;
		color: var(--text-2);
		position: relative;
		transition: background 0.12s;
	}
	.li:hover {
		background: rgba(255, 255, 255, 0.03);
		color: var(--text);
	}
	.li.active {
		background: linear-gradient(90deg, var(--yellow-a20), transparent);
		color: var(--text);
	}
	.li.active::before {
		content: '';
		position: absolute;
		left: 0;
		top: 6px;
		bottom: 6px;
		width: 3px;
		border-radius: 0 3px 3px 0;
		background: var(--yellow);
		box-shadow: 0 0 10px var(--yellow);
	}
</style>
