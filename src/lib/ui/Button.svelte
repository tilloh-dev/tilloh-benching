<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from '../os/Icon.svelte';

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
	disabled={disabled || loading}
	{onclick}
>
	{#if loading}
		<span class="spin"></span>
	{:else if icon}
		<Icon name={icon} size={size === 'sm' ? 14 : 16} accent={variant !== 'primary'} />
	{/if}
	{#if children}<span>{@render children()}</span>{/if}
</button>

<style>
	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 7px;
		height: 32px;
		padding: 0 13px;
		border-radius: 8px;
		border: 1px solid var(--line);
		background: linear-gradient(180deg, #1b2858, #152048);
		color: var(--text);
		font-weight: 500;
		font-size: 13px;
		cursor: pointer;
		white-space: nowrap;
		box-shadow:
			0 1px 0 rgba(255, 255, 255, 0.06) inset,
			0 1px 2px rgba(0, 0, 0, 0.3);
		transition:
			transform 0.08s,
			box-shadow 0.15s,
			border-color 0.15s,
			background 0.15s;
	}
	.btn:hover:not(:disabled) {
		border-color: var(--line-strong);
		box-shadow:
			0 1px 0 rgba(255, 255, 255, 0.08) inset,
			0 0 0 3px rgba(255, 210, 63, 0.06);
	}
	.btn:active:not(:disabled) {
		transform: translateY(1px);
	}
	.btn:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
	.sm {
		height: 26px;
		padding: 0 9px;
		font-size: 12px;
		border-radius: 7px;
	}
	.icon-only {
		padding: 0;
		width: 32px;
	}
	.icon-only.sm {
		width: 26px;
	}
	.primary {
		background: linear-gradient(180deg, var(--yellow-2), var(--yellow));
		border-color: var(--yellow-deep);
		color: var(--yellow-ink);
		font-weight: 600;
		box-shadow:
			0 1px 0 rgba(255, 255, 255, 0.5) inset,
			0 0 18px rgba(255, 210, 63, 0.25);
	}
	.primary:hover:not(:disabled) {
		border-color: var(--yellow-2);
		box-shadow:
			0 1px 0 rgba(255, 255, 255, 0.6) inset,
			0 0 26px rgba(255, 210, 63, 0.45);
	}
	.ghost {
		background: transparent;
		border-color: transparent;
		box-shadow: none;
		color: var(--text-2);
	}
	.ghost:hover:not(:disabled) {
		background: var(--bg-4);
		border-color: var(--line);
		color: var(--text);
	}
	.danger {
		color: #ffb3bd;
	}
	.danger:hover:not(:disabled) {
		background: #4a1420;
		border-color: #a3334a;
		color: #fff;
	}
	.spin {
		width: 14px;
		height: 14px;
		border-radius: 50%;
		border: 2px solid currentColor;
		border-right-color: transparent;
		animation: spin 0.7s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
