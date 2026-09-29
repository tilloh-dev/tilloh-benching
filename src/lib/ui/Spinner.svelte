<script lang="ts">
	let { label = 'loading' }: { label?: string } = $props();
</script>

<div class="spinner"><span class="caret">{label}</span></div>

<style>
	.spinner {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: var(--sp-7);
		height: 100%;
		color: var(--fg-3);
	}
</style>
