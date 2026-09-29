<script lang="ts" module>
	import { PIXEL_ICONS } from './pixel-icons.ts';

	/** Pixel icons render only at integer multiples of their 12 px grid. */
	export function snapIconSize(size: number): 12 | 24 | 36 {
		return size <= 18 ? 12 : size <= 30 ? 24 : 36;
	}

	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- a plain memo cache, never read reactively
	const cache = new Map<string, string>();
	function rects(name: string): string {
		const hit = cache.get(name);
		if (hit) return hit;
		const rows = PIXEL_ICONS[name] ?? PIXEL_ICONS.dot;
		let out = '';
		rows.forEach((row, y) => {
			// merge horizontal runs into one rect each
			let x = 0;
			while (x < row.length) {
				if (row[x] !== '#') {
					x++;
					continue;
				}
				let end = x;
				while (end < row.length && row[end] === '#') end++;
				out += `<rect x="${x}" y="${y}" width="${end - x}" height="1"/>`;
				x = end;
			}
		});
		cache.set(name, out);
		return out;
	}
</script>

<script lang="ts">
	let {
		name,
		size = 12,
		class: klass = ''
	}: { name: string; size?: number; class?: string } = $props();
	const px = $derived(snapIconSize(size));
</script>

<svg
	class="icon {klass}"
	width={px}
	height={px}
	viewBox="0 0 12 12"
	fill="currentColor"
	shape-rendering="crispEdges"
	aria-hidden="true"
>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- generated from the static pixel table -->
	{@html rects(name)}
</svg>

<style>
	.icon {
		flex: none;
		display: inline-block;
		vertical-align: middle;
	}
</style>
