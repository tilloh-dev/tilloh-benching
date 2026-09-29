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
		font-family: var(--font);
		font-size: var(--fs-s);
		line-height: 1.7;
	}
	.children {
		padding-left: var(--sp-6);
		border-left: 1px dashed var(--line-soft);
		margin-left: var(--sp-3);
	}
	.toggler {
		display: inline-flex;
		gap: var(--sp-3);
		align-items: baseline;
		background: none;
		border: 0;
		padding: 0;
		cursor: pointer;
		color: var(--fg-2);
	}
	.caret {
		display: inline-block;
		width: 10px;
		color: var(--fg-3);
		transition: transform var(--dur-2);
	}
	.caret.open {
		transform: rotate(90deg);
	}
	.k {
		color: var(--syn-name);
	}
	.p {
		color: var(--fg-4);
	}
	.leaf {
		padding-left: var(--sp-6);
		word-break: break-all;
		color: var(--fg-3);
	}
	.v.string {
		color: var(--syn-string);
	}
	.v.number {
		color: var(--syn-number);
	}
	.v.boolean {
		color: var(--syn-number);
	}
	.more {
		color: var(--fg-4);
		padding-left: var(--sp-6);
	}
</style>
