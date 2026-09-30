<script lang="ts">
	/**
	 * The running indicator: eight pixel dots on a circle that grow and shrink
	 * one after another. The only continuous animation in BenchyOS besides
	 * live LEDs; shown only while something is running.
	 */
	let { size = 12 }: { size?: number } = $props();
	const DOTS = Array.from({ length: 8 }, (_, i) => {
		const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
		return { x: 6 + Math.cos(a) * 4.25 - 1, y: 6 + Math.sin(a) * 4.25 - 1, i };
	});
</script>

<svg
	class="busy"
	width={size}
	height={size}
	viewBox="0 0 12 12"
	fill="currentColor"
	shape-rendering="crispEdges"
	aria-hidden="true"
>
	{#each DOTS as d (d.i)}
		<rect x={d.x} y={d.y} width="2" height="2" style="animation-delay: {d.i * 0.2 - 1.6}s" />
	{/each}
</svg>

<style>
	.busy {
		flex: none;
		display: inline-block;
		vertical-align: -1px;
	}
	rect {
		transform-box: fill-box;
		transform-origin: center;
		animation: busy-dot 1.6s linear infinite;
	}
	@keyframes busy-dot {
		0%,
		100% {
			transform: scale(0.5);
			opacity: 0.35;
		}
		12% {
			transform: scale(1.25);
			opacity: 1;
		}
		40% {
			transform: scale(0.5);
			opacity: 0.35;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		rect {
			animation: none;
			opacity: 0.7;
		}
	}
</style>
