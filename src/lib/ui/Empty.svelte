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
	<Icon name={icon} size={24} />
	<h3>{title}</h3>
	{#if children}<div class="body">{@render children()}</div>{/if}
</div>

<style>
	.empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--sp-3);
		padding: var(--sp-7);
		height: 100%;
		text-align: center;
		color: var(--fg-3);
		animation: appear var(--dur-2) both;
	}
	h3 {
		margin: 0;
		font-size: var(--fs-m);
		font-weight: var(--fw-strong);
		color: var(--fg);
	}
	.body {
		max-width: 420px;
	}
</style>
