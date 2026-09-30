<script lang="ts">
	import Icon from './Icon.svelte';

	/** A square app tile with a pixel icon; 48 px on the desktop, 24/36 px in menus. */
	let {
		icon,
		size = 48,
		selected = false
	}: { icon: string; size?: 24 | 36 | 48; selected?: boolean } = $props();
</script>

<span class="tile" class:selected style="--s:{size}px">
	<Icon name={icon} size={size >= 48 ? 36 : size >= 36 ? 24 : 12} />
</span>

<style>
	.tile {
		flex: none;
		display: grid;
		place-items: center;
		width: var(--s);
		height: var(--s);
		border: var(--bw) solid var(--line-strong);
		background: var(--surface);
		color: var(--fg-2);
		transition:
			color var(--dur-1),
			border-color var(--dur-1);
	}
	.selected {
		border-color: var(--accent);
		background: var(--accent-soft);
	}
</style>
