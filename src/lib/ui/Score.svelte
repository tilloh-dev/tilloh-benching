<script lang="ts">
	import { scoreColor } from '../design/score.ts';

	/** A 0–100 score: the number (always), a data meter, and the gate marker. */
	let {
		value,
		gate = false,
		width = 80,
		big = false,
		stddev = null
	}: {
		value: number | null | undefined;
		gate?: boolean;
		width?: number;
		big?: boolean;
		stddev?: number | null;
	} = $props();
</script>

{#if value == null}
	<span class="none">—</span>
{:else}
	<span
		class="score"
		class:big
		style="--w:{width}px; --p:{Math.max(0, Math.min(100, value))}%; --c:{scoreColor(value)}"
	>
		<b>{value.toFixed(1)}</b>
		{#if stddev}<small>±{stddev.toFixed(1)}</small>{/if}
		<span class="meter" aria-hidden="true"><span></span></span>
		{#if gate}<em title="a required criterion failed">✕ gate</em>{/if}
	</span>
{/if}

<style>
	.score {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-3);
		font-variant-numeric: tabular-nums;
	}
	b {
		min-width: 4ch;
		text-align: right;
		font-weight: var(--fw-strong);
		color: var(--c);
	}
	small {
		color: var(--fg-3);
		font-size: var(--fs-s);
	}
	em {
		font-style: normal;
		font-size: var(--fs-xs);
		font-weight: var(--fw-strong);
		color: var(--bad);
	}
	.meter {
		width: var(--w);
		height: 6px;
		background: var(--track);
	}
	.meter span {
		display: block;
		height: 100%;
		width: var(--p);
		background: var(--data);
	}
	.big b {
		font-size: var(--fs-xxl);
		line-height: 1;
	}
	.big .meter {
		height: 8px;
	}
	.none {
		color: var(--fg-4);
	}
</style>
