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
							>{#if item.icon}<Icon name={item.icon} size={12} />{/if}</span
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
		gap: var(--sp-3);
		height: var(--control-h-s);
		padding: 0 var(--sp-3);
		border: var(--bw) solid transparent;
		background: transparent;
		color: var(--fg-2);
		cursor: pointer;
	}
	.trigger:hover,
	.trigger.open {
		color: var(--fg);
		border-color: var(--line);
		background: var(--surface-2);
	}
	.menu {
		position: absolute;
		top: calc(100% + var(--sp-1));
		z-index: 30000;
		min-width: 220px;
		padding: var(--sp-1);
		background: var(--surface);
		border: var(--bw) solid var(--line-strong);
		box-shadow: var(--shadow-pop);
		animation: step-unfold var(--dur-2) steps(var(--steps)) both;
	}
	.menu.right {
		right: 0;
	}
	.item {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		width: 100%;
		height: var(--row-h);
		padding: 0 var(--sp-4) 0 var(--sp-3);
		border: 0;
		background: transparent;
		color: var(--fg-2);
		text-align: left;
		cursor: pointer;
	}
	.item:hover:not(:disabled) {
		background: var(--hover);
		color: var(--fg);
	}
	.item:disabled {
		color: var(--fg-4);
		cursor: default;
	}
	.item.danger:hover {
		color: var(--bad);
	}
	.ico {
		width: 12px;
		display: grid;
		place-items: center;
	}
	.hint {
		font-size: var(--fs-xs);
		color: var(--fg-4);
	}
	.sep {
		height: var(--bw);
		margin: var(--sp-1) var(--sp-2);
		background: var(--line);
	}
</style>
