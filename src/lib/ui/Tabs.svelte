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
		display: flex;
		gap: 2px;
		padding: 0 12px;
		border-bottom: 1px solid var(--line-soft);
		background: var(--bg-2);
		flex: none;
		overflow-x: auto;
		overflow-y: hidden;
		scrollbar-width: none;
	}
	.tab {
		position: relative;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		height: 38px;
		padding: 0 12px;
		border: 0;
		background: transparent;
		color: var(--text-3);
		font-weight: 500;
		cursor: pointer;
		white-space: nowrap;
		transition: color 0.15s;
	}
	.small .tab {
		height: 32px;
		font-size: 12.5px;
	}
	.tab:hover:not(:disabled) {
		color: var(--text);
	}
	.tab:disabled {
		opacity: 0.4;
		cursor: default;
	}
	.tab.active {
		color: var(--text);
	}
	.tab::after {
		content: '';
		position: absolute;
		left: 10px;
		right: 10px;
		bottom: -1px;
		height: 2px;
		border-radius: 2px;
		background: var(--yellow);
		box-shadow: 0 0 10px var(--yellow);
		transform: scaleX(0);
		transition: transform 0.2s var(--ease-out);
	}
	.tab.active::after {
		transform: scaleX(1);
	}
	.count {
		font-size: 11px;
		padding: 0 6px;
		border-radius: 999px;
		background: var(--bg-4);
		color: var(--text-2);
	}
</style>
