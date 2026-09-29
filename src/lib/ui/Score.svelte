<script lang="ts">
	/** Score 0–100 as a number plus an animated bar; colour runs red → yellow → teal. */
	let {
		value,
		gate = false,
		width = 90,
		big = false,
		stddev = null
	}: {
		value: number | null | undefined;
		gate?: boolean;
		width?: number;
		big?: boolean;
		stddev?: number | null;
	} = $props();
	const hue = $derived(
		value == null ? 0 : value < 50 ? 350 + (value / 50) * 60 : 45 + ((value - 50) / 50) * 120
	);
</script>

{#if value == null}
	<span class="none">—</span>
{:else}
	<span
		class="score"
		class:big
		style="--w:{width}px; --p:{Math.max(2, Math.min(100, value))}%; --h:{hue % 360}"
	>
		<b>{value.toFixed(1)}</b>
		{#if stddev}<small>±{stddev.toFixed(1)}</small>{/if}
		{#if gate}<em title="a required criterion failed">gate</em>{/if}
		<span class="bar"><span></span></span>
	</span>
{/if}

<style>
	.score {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		font-variant-numeric: tabular-nums;
	}
	b {
		min-width: 34px;
		text-align: right;
		font-weight: 600;
		color: hsl(var(--h) 90% 72%);
	}
	small {
		color: var(--text-3);
		font-size: 11px;
	}
	em {
		font-style: normal;
		font-size: 10px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--bad);
		border: 1px solid color-mix(in srgb, var(--bad) 50%, transparent);
		padding: 0 5px;
		border-radius: 4px;
	}
	.bar {
		width: var(--w);
		height: 6px;
		border-radius: 6px;
		background: var(--bg-1);
		box-shadow: 0 0 0 1px var(--line-soft) inset;
		overflow: hidden;
	}
	.bar span {
		display: block;
		height: 100%;
		width: var(--p);
		border-radius: inherit;
		background: linear-gradient(90deg, hsl(var(--h) 85% 45%), hsl(var(--h) 90% 62%));
		box-shadow: 0 0 10px hsl(var(--h) 90% 55% / 0.6);
		animation: grow 0.6s var(--ease-out) both;
		transform-origin: left;
	}
	@keyframes grow {
		from {
			transform: scaleX(0);
		}
	}
	.big b {
		font-size: 30px;
		line-height: 1;
	}
	.big .bar {
		height: 8px;
	}
	.none {
		color: var(--text-4);
	}
</style>
