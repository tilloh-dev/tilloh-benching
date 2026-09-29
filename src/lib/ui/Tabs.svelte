<script lang="ts">
	let {
		tabs,
		active = $bindable(),
		small = false
	}: {
		tabs: { id: string; label: string; count?: number | string | null; disabled?: boolean }[];
		active: string;
		small?: boolean;
	} = $props();
</script>

<div class="tabs" class:small role="tablist">
	{#each tabs as t (t.id)}
		<button
			role="tab"
			class="tab"
			class:active={active === t.id}
			aria-selected={active === t.id}
			disabled={t.disabled}
			onclick={() => (active = t.id)}
		>
			{t.label}
			{#if t.count != null}<span class="count">{t.count}</span>{/if}
		</button>
	{/each}
</div>

<style>
	.tabs {
		flex: none;
		display: flex;
		padding: 0 var(--sp-4);
		border-bottom: var(--bw) solid var(--line);
		background: var(--surface);
		overflow-x: auto;
		overflow-y: hidden;
		scrollbar-width: none;
	}
	.tab {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-2);
		height: var(--row-h);
		padding: 0 var(--sp-4);
		border: 0;
		border-bottom: 2px solid transparent;
		margin-bottom: -1px;
		background: transparent;
		color: var(--fg-3);
		cursor: pointer;
		white-space: nowrap;
		transition: color var(--dur-2);
	}
	.small .tab {
		height: var(--control-h);
		font-size: var(--fs-s);
	}
	.tab:hover:not(:disabled) {
		color: var(--fg);
	}
	.tab:disabled {
		color: var(--fg-4);
		cursor: default;
	}
	.tab.active {
		color: var(--fg);
		border-bottom-color: var(--accent);
	}
	.count {
		font-size: var(--fs-xs);
		color: var(--fg-3);
	}
	.count::before {
		content: '[';
	}
	.count::after {
		content: ']';
	}
</style>
