<script lang="ts">
	import type { Snippet } from 'svelte';
	let { side, main, width = 290 }: { side: Snippet; main: Snippet; width?: number } = $props();
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
		border-right: 1px solid var(--line-soft);
		background: linear-gradient(180deg, rgba(0, 0, 0, 0.1), rgba(0, 0, 0, 0.18));
	}
	.main {
		min-height: 0;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}
</style>
