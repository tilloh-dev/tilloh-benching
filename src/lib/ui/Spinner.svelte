<script lang="ts">
	let { label = 'Loading…' }: { label?: string } = $props();
</script>

<div class="spinner"><span class="ring"></span><span>{label}</span></div>

<style>
	.spinner {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 10px;
		padding: 30px;
		color: var(--text-3);
		height: 100%;
	}
	.ring {
		width: 18px;
		height: 18px;
		border-radius: 50%;
		border: 2px solid var(--line-strong);
		border-top-color: var(--yellow);
		animation: spin 0.8s linear infinite;
		box-shadow: 0 0 12px rgba(255, 210, 63, 0.2);
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
