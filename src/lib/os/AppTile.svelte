<script lang="ts">
	import Icon from './Icon.svelte';

	/** Glossy app tile: an early-2000s icon, redrawn flat-modern in navy and yellow. */
	let { icon, hue = 225, size = 52 }: { icon: string; hue?: number; size?: number } = $props();
</script>

<span class="tile" style="--h:{hue}; --s:{size}px">
	<span class="gloss"></span>
	<Icon name={icon} size={size * 0.54} stroke={1.6} />
</span>

<style>
	.tile {
		flex: none;
		position: relative;
		display: grid;
		place-items: center;
		width: var(--s);
		height: var(--s);
		border-radius: calc(var(--s) * 0.26);
		color: #f3f5ff;
		background:
			radial-gradient(120% 90% at 30% 0%, hsl(var(--h) 70% 44% / 0.95), transparent 60%),
			linear-gradient(160deg, hsl(var(--h) 55% 30%), hsl(var(--h) 60% 14%));
		box-shadow:
			0 1px 0 hsl(var(--h) 80% 75% / 0.35) inset,
			0 -2px 6px rgba(0, 0, 0, 0.35) inset,
			0 6px 16px rgba(0, 0, 0, 0.45),
			0 0 0 1px hsl(var(--h) 60% 50% / 0.35);
		overflow: hidden;
		transition:
			transform 0.25s var(--ease-spring),
			box-shadow 0.2s;
	}
	.gloss {
		position: absolute;
		inset: 0 0 52% 0;
		border-radius: inherit;
		background: linear-gradient(180deg, rgba(255, 255, 255, 0.28), rgba(255, 255, 255, 0.02));
		pointer-events: none;
	}
	.tile :global(svg) {
		position: relative;
		filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.5));
	}
</style>
