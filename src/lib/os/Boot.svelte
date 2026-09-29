<script lang="ts">
	import Logo from './Logo.svelte';
	let { done = false, error = null }: { done?: boolean; error?: string | null } = $props();
</script>

<div class="boot" class:done>
	<div class="center">
		<Logo size={36} />
		<h1>BenchyOS</h1>
		{#if error}
			<p class="err">✕ {error}</p>
		{:else}
			<p class="line caret">loading results</p>
		{/if}
	</div>
</div>

<style>
	.boot {
		position: fixed;
		inset: 0;
		z-index: 50000;
		display: grid;
		place-items: center;
		background: var(--bg);
		color: var(--fg);
	}
	/* Retro moment: the boot screen dissolves in visible steps. */
	.boot.done {
		animation: boot-out var(--dur-3) steps(var(--steps)) forwards;
		pointer-events: none;
	}
	@keyframes boot-out {
		to {
			opacity: 0;
			visibility: hidden;
		}
	}
	.center {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--sp-4);
	}
	h1 {
		margin: 0;
		font-size: var(--fs-xl);
		font-weight: var(--fw-strong);
	}
	.line {
		margin: 0;
		color: var(--fg-3);
	}
	.err {
		color: var(--bad);
		max-width: 420px;
		text-align: center;
	}
</style>
