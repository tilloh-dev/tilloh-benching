<script lang="ts">
	import Logo from './Logo.svelte';
	let { done = false, error = null }: { done?: boolean; error?: string | null } = $props();
</script>

<div class="boot" class:done>
	<div class="center">
		<Logo size={84} />
		<h1>benchy<span>os</span></h1>
		{#if error}
			<p class="err">{error}</p>
		{:else}
			<div class="progress"><span></span></div>
			<p class="muted">loading results…</p>
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
		background:
			radial-gradient(60% 50% at 50% 42%, rgba(255, 210, 63, 0.1), transparent 70%), var(--bg-0);
		transition:
			opacity 0.5s ease 0.15s,
			visibility 0s linear 0.65s;
	}
	.boot.done {
		opacity: 0;
		visibility: hidden;
	}
	.center {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 14px;
		animation: fade-up 0.5s var(--ease-out) both;
	}
	.center :global(.logo) {
		animation: breathe 2.4s ease-in-out infinite;
	}
	@keyframes breathe {
		50% {
			filter: drop-shadow(0 0 22px rgba(255, 210, 63, 0.85));
		}
	}
	h1 {
		margin: 0;
		font-size: 34px;
		font-weight: 700;
		letter-spacing: -0.02em;
	}
	h1 span {
		color: var(--yellow);
		text-shadow: 0 0 18px rgba(255, 210, 63, 0.6);
	}
	.progress {
		width: 220px;
		height: 6px;
		border-radius: 6px;
		background: var(--bg-3);
		overflow: hidden;
		box-shadow: 0 0 0 1px var(--line) inset;
	}
	.progress span {
		display: block;
		height: 100%;
		width: 40%;
		border-radius: inherit;
		background: linear-gradient(90deg, transparent, var(--yellow), transparent);
		animation: slide 1.1s ease-in-out infinite;
	}
	@keyframes slide {
		from {
			transform: translateX(-100%);
		}
		to {
			transform: translateX(250%);
		}
	}
	.err {
		color: var(--bad);
		max-width: 420px;
		text-align: center;
	}
</style>
