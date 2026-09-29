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
		border: var(--bw) solid var(--line-strong);
	}
	button {
		height: calc(var(--control-h) - 2px);
		padding: 0 var(--sp-4);
		border: 0;
		border-right: var(--bw) solid var(--line);
		background: var(--sunken);
		color: var(--fg-3);
		font-size: var(--fs-s);
		cursor: pointer;
		transition: color var(--dur-1);
	}
	button:last-child {
		border-right: 0;
	}
	button:hover {
		color: var(--fg);
	}
	button.on {
		background: var(--surface-2);
		color: var(--fg);
		font-weight: var(--fw-strong);
	}
</style>
