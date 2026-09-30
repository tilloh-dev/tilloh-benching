<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from '../os/Icon.svelte';
	import Busy from './Busy.svelte';

	let {
		variant = 'default',
		size = 'md',
		icon,
		loading = false,
		disabled = false,
		title,
		type = 'button',
		onclick,
		children
	}: {
		/** primary: the one main action of a view (accent). ghost: toolbar actions. */
		variant?: 'default' | 'primary' | 'ghost' | 'danger';
		size?: 'sm' | 'md';
		icon?: string;
		loading?: boolean;
		disabled?: boolean;
		title?: string;
		type?: 'button' | 'submit';
		onclick?: (e: MouseEvent) => void;
		children?: Snippet;
	} = $props();
</script>

<button
	class="btn {variant} {size}"
	class:icon-only={!children}
	{type}
	{title}
	aria-label={!children ? title : undefined}
	disabled={disabled || loading}
	{onclick}
>
	{#if loading}
		<Busy />
	{:else if icon}
		<Icon name={icon} size={12} mono={variant === 'primary'} />
	{/if}
	{#if children}<span>{@render children()}</span>{/if}
</button>

<style>
	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--sp-3);
		height: var(--control-h);
		padding: 0 var(--sp-4);
		border: var(--bw) solid var(--line-strong);
		background: var(--surface-2);
		color: var(--fg);
		font-size: var(--fs-m);
		font-weight: var(--fw-strong);
		white-space: nowrap;
		cursor: pointer;
		transition:
			background var(--dur-1),
			border-color var(--dur-1);
	}
	.btn:hover:not(:disabled) {
		background: var(--hover);
		border-color: var(--fg-3);
	}
	.btn:active:not(:disabled) {
		background: var(--sunken);
	}
	.btn:disabled {
		color: var(--fg-4);
		cursor: not-allowed;
	}
	.sm {
		height: var(--control-h-s);
		padding: 0 var(--sp-3);
		font-size: var(--fs-s);
	}
	.icon-only {
		width: var(--control-h);
		padding: 0;
	}
	.icon-only.sm {
		width: var(--control-h-s);
	}
	.primary {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--accent-fg);
	}
	.primary:hover:not(:disabled) {
		background: var(--accent);
		border-color: var(--fg);
	}
	.primary:disabled {
		background: var(--surface-2);
		border-color: var(--line);
	}
	.ghost {
		background: transparent;
		border-color: transparent;
		color: var(--fg-2);
		font-weight: var(--fw);
	}
	.ghost:hover:not(:disabled) {
		color: var(--fg);
		border-color: var(--line);
	}
	.danger {
		color: var(--bad);
	}
	.danger:hover:not(:disabled) {
		border-color: var(--bad);
	}
</style>
