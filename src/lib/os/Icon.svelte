<script lang="ts" module>
	/**
	 * BenchyOS glyphs: 24×24 line icons. Elements with class "a" pick up the
	 * accent (yellow) so the same glyph works in monochrome and duotone.
	 */
	export const GLYPHS: Record<string, string> = {
		bench:
			'<path d="M3 11h18"/><path d="M4 11V8.5a1.5 1.5 0 0 1 1.5-1.5h13A1.5 1.5 0 0 1 20 8.5V11"/><path d="M5 11v7M19 11v7M4 15h16"/><circle class="a" cx="12" cy="4" r="1.6"/>',
		trophy:
			'<path d="M8 4h8v5a4 4 0 0 1-8 0V4Z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4"/><path d="M12 13v3M9 20h6M10 16h4l.5 4h-5l.5-4Z"/><path class="a" d="M11 7l1-1.2 1 1.2" />',
		rocket:
			'<path d="M12 3c3.5 2 5 5.5 5 9l-2.5 3h-5L7 12c0-3.5 1.5-7 5-9Z"/><circle class="a" cx="12" cy="9.5" r="1.7"/><path d="M9.5 15 8 19l2.5-1.5M14.5 15 16 19l-2.5-1.5M12 16.5V21"/>',
		play: '<path d="M8 5.5v13l10-6.5-10-6.5Z"/>',
		blueprint:
			'<rect x="3.5" y="4" width="17" height="14" rx="1.5"/><path d="M3.5 9h17M9 4v14M14.5 9v9" opacity=".55"/><path class="a" d="M15 15.5 19.5 11l1.5 1.5-4.5 4.5H15v-1.5Z"/>',
		flask:
			'<path d="M9.5 3.5h5M10.5 3.5v5L5.2 17.3A2 2 0 0 0 6.9 20.5h10.2a2 2 0 0 0 1.7-3.2L13.5 8.5v-5"/><path class="a" d="M7.6 15h8.8l1.6 2.6a1 1 0 0 1-.9 1.4H6.9a1 1 0 0 1-.9-1.4L7.6 15Z"/>',
		layers:
			'<path d="m12 3.5 8.5 4.5L12 12.5 3.5 8 12 3.5Z"/><path d="m3.5 12 8.5 4.5 8.5-4.5M3.5 16l8.5 4.5 8.5-4.5"/><path class="a" d="m12 5.3 5.2 2.7L12 10.7 6.8 8 12 5.3Z"/>',
		gavel:
			'<path d="m13.5 4.5 6 6M11 7l6 6M12.25 5.75l-3.5 3.5 6 6 3.5-3.5"/><path d="M11.8 12.2 4.5 19.5"/><path d="M3.5 20.5h8"/><path class="a" d="m10.5 7.5 6 6-1.8 1.8-6-6 1.8-1.8Z"/>',
		chip: '<rect x="6.5" y="6.5" width="11" height="11" rx="1.5"/><rect class="a" x="9.5" y="9.5" width="5" height="5" rx=".8"/><path d="M9 3.5v3M12 3.5v3M15 3.5v3M9 17.5v3M12 17.5v3M15 17.5v3M3.5 9h3M3.5 12h3M3.5 15h3M17.5 9h3M17.5 12h3M17.5 15h3"/>',
		gear: '<circle class="a" cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M21.2 12h-2.4M5.2 12H2.8M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7M18.5 18.5l-1.7-1.7M7.2 7.2 5.5 5.5"/><circle cx="12" cy="12" r="6.2"/>',
		compare:
			'<rect x="3.5" y="4.5" width="7.5" height="15" rx="1.5"/><rect x="13" y="4.5" width="7.5" height="15" rx="1.5"/><path class="a" d="M5.5 8h3.5M15 8h3.5M5.5 11h2.5M15 11h3"/>',
		home: '<path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19v-8.5Z"/><path class="a" d="M9.5 20.5v-5.5h5v5.5"/>',
		list: '<path d="M9 6.5h11M9 12h11M9 17.5h11"/><circle class="a" cx="5" cy="6.5" r="1.2"/><circle class="a" cx="5" cy="12" r="1.2"/><circle class="a" cx="5" cy="17.5" r="1.2"/>',
		grid: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.2"/><rect class="a" x="13.5" y="4" width="6.5" height="6.5" rx="1.2"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.2"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.2"/>',
		file: '<path d="M6.5 3.5h7l4 4v12a1 1 0 0 1-1 1h-10a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1Z"/><path d="M13.5 3.5v4h4"/>',
		html: '<path d="M6.5 3.5h7l4 4v12a1 1 0 0 1-1 1h-10a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1Z"/><path class="a" d="m10 11.5-2 2 2 2M14 11.5l2 2-2 2"/>',
		cube: '<path d="m12 3.5 7.5 4.2v8.6L12 20.5l-7.5-4.2V7.7L12 3.5Z"/><path d="m4.5 7.7 7.5 4.3 7.5-4.3M12 12v8.5"/><path class="a" d="m12 5.4 5.6 3.1L12 11.7 6.4 8.5 12 5.4Z"/>',
		terminal:
			'<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path class="a" d="m7 9.5 3 2.5-3 2.5"/><path d="M12 15h5"/>',
		text: '<path d="M6.5 3.5h7l4 4v12a1 1 0 0 1-1 1h-10a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1Z"/><path class="a" d="M8.5 11h7M8.5 14h7M8.5 17h4"/>',
		image:
			'<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle class="a" cx="9" cy="9.5" r="1.8"/><path d="m4 17 5-4.5 3.5 3 3-2.5L20 17"/>',
		search: '<circle cx="11" cy="11" r="6"/><path d="m20 20-4.5-4.5"/>',
		close: '<path d="M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5"/>',
		minimize: '<path d="M6 17h12"/>',
		maximize: '<rect x="6" y="6" width="12" height="12" rx="1.5"/>',
		restore:
			'<rect x="5.5" y="8.5" width="10" height="10" rx="1.5"/><path d="M8.5 8.5V6.5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-2"/>',
		check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
		alert: '<path d="M12 4 21 19.5H3L12 4Z"/><path class="a" d="M12 10v4.2M12 16.6v.1"/>',
		error: '<circle cx="12" cy="12" r="8.5"/><path class="a" d="m9 9 6 6M15 9l-6 6"/>',
		info: '<circle cx="12" cy="12" r="8.5"/><path class="a" d="M12 11v5.5M12 7.6v.1"/>',
		clock: '<circle cx="12" cy="12" r="8.5"/><path class="a" d="M12 7.5V12l3 2"/>',
		refresh:
			'<path d="M19.5 12a7.5 7.5 0 0 1-13 5.1M4.5 12a7.5 7.5 0 0 1 13-5.1"/><path class="a" d="M17.5 3.5v3.4h-3.4M6.5 20.5v-3.4h3.4"/>',
		trash:
			'<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/><path class="a" d="M10.5 10.5v6M13.5 10.5v6"/>',
		plus: '<path d="M12 5v14M5 12h14"/>',
		copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="1.5"/><path d="M15.5 8.5v-3a1 1 0 0 0-1-1h-9a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h3"/>',
		save: '<path d="M5 4.5h11l3.5 3.5v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-13.5a1 1 0 0 1 1-1Z"/><path d="M8 4.5v4h7v-4"/><rect class="a" x="7.5" y="13" width="9" height="5" rx=".8"/>',
		download: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14"/>',
		upload: '<path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M5 19.5h14"/>',
		edit: '<path d="m15 5 4 4L9 19H5v-4L15 5Z"/><path class="a" d="m13 7 4 4"/>',
		eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle class="a" cx="12" cy="12" r="2.8"/>',
		chevronDown: '<path d="m6.5 9.5 5.5 5.5 5.5-5.5"/>',
		chevronRight: '<path d="m9.5 6.5 5.5 5.5-5.5 5.5"/>',
		chevronLeft: '<path d="m14.5 6.5-5.5 5.5 5.5 5.5"/>',
		bolt: '<path class="a" d="M13 3 5.5 13.5H11L10 21l8-11h-5.5L13 3Z"/>',
		user: '<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20c1.2-4 4.1-6 7.5-6s6.3 2 7.5 6"/>',
		star: '<path class="a" d="m12 4 2.5 5.1 5.6.8-4 3.9.9 5.6L12 16.8l-5 2.6.9-5.6-4-3.9 5.6-.8L12 4Z"/>',
		sliders:
			'<path d="M5 6h9M18 6h1M5 12h3M12 12h7M5 18h11M20 18h-1"/><circle class="a" cx="16" cy="6" r="2"/><circle class="a" cx="10" cy="12" r="2"/><circle class="a" cx="18" cy="18" r="2"/>',
		filter: '<path d="M4 5.5h16l-6.2 7.3V19l-3.6-1.8v-4.4L4 5.5Z"/>',
		external:
			'<path d="M13.5 4.5h6v6M19.5 4.5 11 13"/><path d="M18 14v4.5a1 1 0 0 1-1 1H5.5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1H10"/>',
		stop: '<rect class="a" x="6.5" y="6.5" width="11" height="11" rx="2"/>',
		flame:
			'<path d="M12 3.5s5.5 4.5 5.5 9.5a5.5 5.5 0 0 1-11 0c0-2.3 1.2-4.1 2.3-5.2.2 1.7 1 2.7 2 3.2-.3-2.8.2-5.3 1.2-7.5Z"/><path class="a" d="M12 20a2.5 2.5 0 0 1-2.5-2.5c0-1.5 2.5-4 2.5-4s2.5 2.5 2.5 4A2.5 2.5 0 0 1 12 20Z"/>',
		sparkle:
			'<path class="a" d="M12 3.5 13.8 10.2 20.5 12l-6.7 1.8L12 20.5l-1.8-6.7L3.5 12l6.7-1.8L12 3.5Z"/>',
		menu: '<path d="M4.5 7h15M4.5 12h15M4.5 17h15"/>',
		dot: '<circle class="a" cx="12" cy="12" r="3"/>',
		link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1"/>',
		book: '<path d="M4.5 5.5a2 2 0 0 1 2-2H19v15H6.5a2 2 0 0 0-2 2v-15Z"/><path d="M4.5 18.5a2 2 0 0 1 2-2H19v4H6.5a2 2 0 0 1-2-2Z"/><path class="a" d="M9 7.5h6"/>',
		keyboard:
			'<rect x="2.5" y="6" width="19" height="12" rx="2"/><path class="a" d="M6 10h1M9.5 10h1M13 10h1M16.5 10h1M7.5 14h9"/>'
	};
</script>

<script lang="ts">
	let {
		name,
		size = 18,
		stroke = 1.7,
		accent = true,
		class: klass = ''
	}: { name: string; size?: number; stroke?: number; accent?: boolean; class?: string } = $props();
</script>

<svg
	class="icon {klass}"
	class:duo={accent}
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width={stroke}
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- static glyph table above -->
	{@html GLYPHS[name] ?? GLYPHS.dot}
</svg>

<style>
	.icon {
		flex: none;
		display: inline-block;
		vertical-align: middle;
	}
	.icon :global(.a) {
		stroke: currentColor;
	}
	.duo :global(.a) {
		stroke: var(--icon-accent, var(--yellow));
		fill: color-mix(in srgb, var(--icon-accent, var(--yellow)) 22%, transparent);
	}
</style>
