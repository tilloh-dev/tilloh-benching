<script lang="ts">
	import JsonTree from './JsonTree.svelte';

	let {
		value,
		name = null,
		depth = 0,
		open = depth < 1
	}: { value: unknown; name?: string | null; depth?: number; open?: boolean } = $props();
	// Follows `open` until the user toggles it.
	let expanded = $derived(open);
	const isObj = $derived(value !== null && typeof value === 'object');
	const entries = $derived(
		isObj
			? Array.isArray(value)
				? value.map((v, i) => [String(i), v] as const)
				: Object.entries(value as object)
			: []
	);
	const preview = $derived(
		Array.isArray(value) ? `[${(value as unknown[]).length}]` : isObj ? `{${entries.length}}` : ''
	);
</script>

<div class="node" style="--d:{depth}">
	{#if isObj}
		<button class="key toggler" onclick={() => (expanded = !expanded)}>
			<span class="caret" class:open={expanded}>▸</span>
			{#if name !== null}<span class="k">{name}</span>{/if}
			<span class="p">{preview}</span>
		</button>
		{#if expanded}
			<div class="children">
				{#each entries.slice(0, 400) as [k, v] (k)}
					<JsonTree value={v} name={k} depth={depth + 1} open={depth + 1 < 1} />
				{/each}
				{#if entries.length > 400}<div class="more">… {entries.length - 400} more</div>{/if}
			</div>
		{/if}
	{:else}
		<div class="leaf">
			{#if name !== null}<span class="k">{name}</span>:{/if}
			<span class="v {typeof value}"
				>{typeof value === 'string' ? JSON.stringify(value) : String(value)}</span
			>
		</div>
	{/if}
</div>

<style>
	.node {
		font-family: var(--mono);
		font-size: 12px;
		line-height: 1.7;
	}
	.children {
		padding-left: 16px;
		border-left: 1px dashed var(--line-soft);
		margin-left: 5px;
	}
	.toggler {
		display: inline-flex;
		gap: 6px;
		align-items: baseline;
		background: none;
		border: 0;
		padding: 0;
		cursor: pointer;
		color: var(--text-2);
	}
	.caret {
		display: inline-block;
		width: 10px;
		color: var(--text-3);
		transition: transform 0.15s;
	}
	.caret.open {
		transform: rotate(90deg);
	}
	.k {
		color: #8fb8ff;
	}
	.p {
		color: var(--text-4);
	}
	.leaf {
		padding-left: 16px;
		word-break: break-all;
		color: var(--text-3);
	}
	.v.string {
		color: #7ee6c3;
	}
	.v.number {
		color: #ff9f7a;
	}
	.v.boolean {
		color: var(--yellow);
	}
	.more {
		color: var(--text-4);
		padding-left: 16px;
	}
</style>
