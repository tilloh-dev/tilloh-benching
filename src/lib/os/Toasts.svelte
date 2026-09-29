<script lang="ts">
	import Icon from './Icon.svelte';
	import { toasts } from './toasts.svelte.ts';
	const icons = { info: 'info', ok: 'check', warn: 'alert', error: 'error' };
</script>

<div class="toasts">
	{#each toasts.items as t (t.id)}
		<div class="toast {t.kind}">
			<Icon name={icons[t.kind]} size={12} />
			<div class="grow">
				<div class="title">{t.title}</div>
				{#if t.body}<div class="body">{t.body}</div>{/if}
			</div>
			<button aria-label="Dismiss" onclick={() => toasts.dismiss(t.id)}
				><Icon name="close" size={12} /></button
			>
		</div>
	{/each}
</div>

<style>
	.toasts {
		position: fixed;
		right: var(--sp-4);
		bottom: calc(var(--taskbar-h) + var(--sp-4));
		z-index: 40000;
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
		width: 340px;
		pointer-events: none;
	}
	.toast {
		pointer-events: auto;
		display: flex;
		align-items: flex-start;
		gap: var(--sp-3);
		padding: var(--sp-3) var(--sp-4);
		background: var(--surface);
		border: var(--bw) solid var(--line-strong);
		border-left: 2px solid var(--c);
		box-shadow: var(--shadow-pop);
		animation: step-unfold var(--dur-2) steps(var(--steps)) both;
		--c: var(--info);
	}
	.toast > :global(svg) {
		color: var(--c);
		margin-top: var(--sp-1);
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
		font-weight: var(--fw-strong);
	}
	.body {
		font-size: var(--fs-s);
		color: var(--fg-2);
		word-break: break-word;
	}
	button {
		border: 0;
		background: none;
		color: var(--fg-3);
		cursor: pointer;
		padding: 0;
	}
	button:hover {
		color: var(--fg);
	}
</style>
