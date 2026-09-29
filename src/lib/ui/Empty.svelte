<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from '../os/Icon.svelte';
	let {
		icon = 'sparkle',
		title,
		children
	}: { icon?: string; title: string; children?: Snippet } = $props();
</script>

<div class="empty">
	<div class="ico"><Icon name={icon} size={30} /></div>
	<h3>{title}</h3>
	{#if children}<div class="body">{@render children()}</div>{/if}
</div>

<style>
	.empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		text-align: center;
		gap: 6px;
		padding: 40px 20px;
		color: var(--text-3);
		height: 100%;
		animation: fade-up 0.3s both;
	}
	.ico {
		display: grid;
		place-items: center;
		width: 60px;
		height: 60px;
		border-radius: 18px;
		background: var(--bg-3);
		border: 1px solid var(--line-soft);
		color: var(--text-2);
		box-shadow: var(--glow-soft);
		margin-bottom: 6px;
	}
	h3 {
		margin: 0;
		font-size: 15px;
		color: var(--text);
		font-weight: 600;
	}
	.body {
		max-width: 420px;
		font-size: 13px;
	}
</style>
