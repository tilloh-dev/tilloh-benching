<script lang="ts">
	let {
		checked = $bindable(false),
		label,
		disabled = false
	}: { checked?: boolean; label?: string; disabled?: boolean } = $props();
</script>

<label class="toggle" class:disabled>
	<input type="checkbox" bind:checked {disabled} />
	<span class="box" aria-hidden="true">{checked ? '■' : ''}</span>
	{#if label}<span>{label}</span>{/if}
</label>

<style>
	.toggle {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-3);
		cursor: pointer;
		color: var(--fg-2);
		user-select: none;
	}
	.disabled {
		color: var(--fg-4);
		cursor: default;
	}
	input {
		position: absolute;
		opacity: 0;
		pointer-events: none;
	}
	.box {
		display: grid;
		place-items: center;
		width: 14px;
		height: 14px;
		border: var(--bw) solid var(--line-strong);
		background: var(--sunken);
		color: var(--fg);
		font-size: var(--fs-xs);
		line-height: 1;
	}
	input:focus-visible + .box {
		outline: 1px solid var(--focus);
		outline-offset: 1px;
	}
</style>
