<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from './Icon.svelte';

	export type MenuItem =
		| {
				label: string;
				icon?: string;
				hint?: string;
				disabled?: boolean;
				danger?: boolean;
				action: () => void;
		  }
		| 'sep';

	let {
		items,
		trigger,
		align = 'left'
	}: {
		items: MenuItem[];
		trigger: Snippet<[{ open: boolean }]>;
		align?: 'left' | 'right';
	} = $props();
	let open = $state(false);
	let root: HTMLDivElement | undefined = $state();

	function onDoc(e: PointerEvent) {
		if (open && root && !root.contains(e.target as Node)) open = false;
	}
</script>

<svelte:document onpointerdown={onDoc} onkeydown={(e) => e.key === 'Escape' && (open = false)} />

<div class="menu-root" bind:this={root}>
	<button class="trigger" class:open onclick={() => (open = !open)}
		>{@render trigger({ open })}</button
	>
	{#if open}
		<div class="menu {align}" role="menu">
			{#each items as item, i (i)}
				{#if item === 'sep'}
					<div class="sep"></div>
				{:else}
					<button
						class="item"
						class:danger={item.danger}
						role="menuitem"
						disabled={item.disabled}
						onclick={() => {
							open = false;
							item.action();
						}}
					>
						<span class="ico"
							>{#if item.icon}<Icon name={item.icon} size={15} />{/if}</span
						>
						<span class="grow">{item.label}</span>
						{#if item.hint}<span class="hint">{item.hint}</span>{/if}
					</button>
				{/if}
			{/each}
		</div>
	{/if}
</div>

<style>
	.menu-root {
		position: relative;
	}
	.trigger {
		display: flex;
		align-items: center;
		gap: 7px;
		height: 28px;
		padding: 0 10px;
		border-radius: 7px;
		border: 1px solid transparent;
		background: transparent;
		color: var(--text-2);
		cursor: pointer;
		font-weight: 500;
	}
	.trigger:hover,
	.trigger.open {
		background: var(--bg-4);
		color: var(--text);
		border-color: var(--line);
	}
	.menu {
		position: absolute;
		top: calc(100% + 6px);
		z-index: 30000;
		min-width: 230px;
		padding: 5px;
		border-radius: var(--radius);
		background: rgba(18, 28, 65, 0.97);
		border: 1px solid var(--line-strong);
		box-shadow: var(--shadow-pop);
		backdrop-filter: blur(12px);
		animation: menu-in 0.14s var(--ease-out) both;
		transform-origin: top left;
	}
	.menu.right {
		right: 0;
		transform-origin: top right;
	}
	@keyframes menu-in {
		from {
			opacity: 0;
			transform: scale(0.96) translateY(-4px);
		}
	}
	.item {
		display: flex;
		align-items: center;
		gap: 9px;
		width: 100%;
		height: 32px;
		padding: 0 10px 0 8px;
		border: 0;
		border-radius: 7px;
		background: transparent;
		color: var(--text-2);
		cursor: pointer;
		text-align: left;
		font-size: 13px;
	}
	.item:hover:not(:disabled) {
		background: linear-gradient(90deg, var(--yellow-a20), var(--yellow-a10));
		color: var(--text);
	}
	.item:disabled {
		opacity: 0.4;
		cursor: default;
	}
	.item.danger:hover {
		background: #4a1420;
	}
	.ico {
		width: 18px;
		display: grid;
		place-items: center;
	}
	.hint {
		font-size: 11px;
		color: var(--text-4);
	}
	.sep {
		height: 1px;
		margin: 5px 6px;
		background: var(--line);
	}
</style>
