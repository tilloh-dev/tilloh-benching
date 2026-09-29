<script lang="ts">
	import type { Snippet } from 'svelte';
	let { side, main, width = 260 }: { side: Snippet; main: Snippet; width?: number } = $props();
</script>

<div class="split" style="--w:{width}px">
	<aside class="side">{@render side()}</aside>
	<section class="main">{@render main()}</section>
</div>

<style>
	.split {
		flex: 1;
		min-height: 0;
		display: grid;
		grid-template-columns: var(--w) 1fr;
	}
	.side {
		min-height: 0;
		overflow: auto;
		border-right: var(--bw) solid var(--line);
		background: var(--surface);
	}
	.main {
		min-height: 0;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}
</style>
