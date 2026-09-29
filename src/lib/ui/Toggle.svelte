<script lang="ts">
	let {
		checked = $bindable(false),
		label,
		disabled = false
	}: { checked?: boolean; label?: string; disabled?: boolean } = $props();
</script>

<label class="toggle" class:disabled>
	<input type="checkbox" bind:checked {disabled} />
	<span class="track"><span class="knob"></span></span>
	{#if label}<span class="text">{label}</span>{/if}
</label>

<style>
	.toggle {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		cursor: pointer;
		font-size: 13px;
		color: var(--text-2);
		user-select: none;
	}
	.disabled {
		opacity: 0.5;
		cursor: default;
	}
	input {
		position: absolute;
		opacity: 0;
		pointer-events: none;
	}
	.track {
		position: relative;
		width: 34px;
		height: 20px;
		border-radius: 20px;
		background: var(--bg-1);
		border: 1px solid var(--line-strong);
		transition:
			background 0.2s,
			border-color 0.2s,
			box-shadow 0.2s;
	}
	.knob {
		position: absolute;
		top: 2px;
		left: 2px;
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: var(--text-3);
		transition:
			transform 0.22s var(--ease-spring),
			background 0.2s;
	}
	input:checked + .track {
		background: var(--yellow-a20);
		border-color: var(--yellow);
		box-shadow: 0 0 12px var(--yellow-a20);
	}
	input:checked + .track .knob {
		transform: translateX(14px);
		background: var(--yellow);
	}
	input:focus-visible + .track {
		outline: 2px solid var(--yellow);
		outline-offset: 2px;
	}
</style>
