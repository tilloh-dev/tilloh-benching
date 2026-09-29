<script lang="ts">
	import Icon from './Icon.svelte';
	import { toasts } from './toasts.svelte.ts';
	const icons = { info: 'info', ok: 'check', warn: 'alert', error: 'error' };
</script>

<div class="toasts">
	{#each toasts.items as t (t.id)}
		<div class="toast {t.kind}">
			<Icon name={icons[t.kind]} size={18} />
			<div class="grow">
				<div class="title">{t.title}</div>
				{#if t.body}<div class="body">{t.body}</div>{/if}
			</div>
			<button aria-label="Dismiss" onclick={() => toasts.dismiss(t.id)}
				><Icon name="close" size={14} /></button
			>
		</div>
	{/each}
</div>

<style>
	.toasts {
		position: fixed;
		right: 16px;
		bottom: calc(var(--taskbar-h) + 14px);
		z-index: 40000;
		display: flex;
		flex-direction: column;
		gap: 8px;
		width: 360px;
		pointer-events: none;
	}
	.toast {
		pointer-events: auto;
		display: flex;
		align-items: flex-start;
		gap: 10px;
		padding: 11px 12px;
		border-radius: var(--radius);
		background: var(--bg-3);
		border: 1px solid var(--line);
		box-shadow: var(--shadow-pop);
		animation: toast-in 0.3s var(--ease-spring) both;
		--c: var(--info);
		border-left: 3px solid var(--c);
	}
	.toast :global(svg) {
		color: var(--c);
		--icon-accent: var(--c);
		margin-top: 1px;
	}
	.ok {
		--c: var(--ok);
	}
	.warn {
		--c: var(--warn);
	}
	.error {
		--c: var(--bad);
	}
	.title {
		font-weight: 600;
		font-size: 13px;
	}
	.body {
		font-size: 12.5px;
		color: var(--text-2);
		margin-top: 2px;
		word-break: break-word;
	}
	button {
		background: none;
		border: 0;
		color: var(--text-3);
		cursor: pointer;
		padding: 2px;
	}
	@keyframes toast-in {
		from {
			opacity: 0;
			transform: translateX(30px) scale(0.96);
		}
	}
</style>
