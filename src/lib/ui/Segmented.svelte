<script lang="ts">
	let {
		options,
		value = $bindable()
	}: { options: { id: string; label: string }[]; value: string } = $props();
</script>

<div class="seg" role="radiogroup">
	{#each options as o (o.id)}
		<button
			role="radio"
			aria-checked={value === o.id}
			class:on={value === o.id}
			onclick={() => (value = o.id)}>{o.label}</button
		>
	{/each}
</div>

<style>
	.seg {
		display: inline-flex;
		padding: 2px;
		gap: 2px;
		border-radius: 8px;
		background: var(--bg-1);
		border: 1px solid var(--line);
	}
	button {
		height: 26px;
		padding: 0 10px;
		border: 0;
		border-radius: 6px;
		background: transparent;
		color: var(--text-3);
		font-size: 12px;
		font-weight: 500;
		cursor: pointer;
		transition:
			background 0.15s,
			color 0.15s;
	}
	button:hover {
		color: var(--text);
	}
	button.on {
		background: var(--bg-4);
		color: var(--yellow-2);
		box-shadow: 0 1px 0 rgba(255, 255, 255, 0.06) inset;
	}
</style>
