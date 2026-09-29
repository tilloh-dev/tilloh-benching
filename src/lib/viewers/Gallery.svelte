<script lang="ts">
	import Icon from '../os/Icon.svelte';

	let { images }: { images: { url: string; label: string }[] } = $props();
	let open = $state<number | null>(null);

	function onKey(e: KeyboardEvent) {
		const cur = open;
		if (cur === null) return;
		if (e.key === 'Escape') open = null;
		else if (e.key === 'ArrowRight') open = (cur + 1) % images.length;
		else if (e.key === 'ArrowLeft') open = (cur - 1 + images.length) % images.length;
	}
</script>

<svelte:window onkeydown={onKey} />

<div class="gallery">
	{#each images as img, i (img.url)}
		<button class="thumb" onclick={() => (open = i)} style="animation-delay:{i * 40}ms">
			<img src={img.url} alt={img.label} loading="lazy" />
			<span class="cap ellipsis">{img.label}</span>
		</button>
	{/each}
</div>

{#if open !== null}
	<div class="lightbox" role="presentation" onclick={() => (open = null)}>
		<figure>
			<img src={images[open].url} alt={images[open].label} />
			<figcaption>
				{images[open].label} <span class="muted">· {open + 1}/{images.length} · ← → Esc</span>
			</figcaption>
		</figure>
		<button class="x" aria-label="Close"><Icon name="close" size={12} /></button>
	</div>
{/if}

<style>
	.gallery {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
		gap: var(--sp-5);
	}
	.thumb {
		display: flex;
		flex-direction: column;
		padding: 0;
		border: var(--bw) solid var(--line-soft);
		background: var(--sunken);
		overflow: hidden;
		cursor: zoom-in;
		animation: appear var(--dur-3) both;
		transition:
			border-color var(--dur-2),
			transform var(--dur-3) var(--ease),
			box-shadow var(--dur-3);
	}
	.thumb:hover {
		border-color: var(--fg-3);
	}
	.thumb img {
		width: 100%;
		aspect-ratio: 16 / 10;
		object-fit: cover;
		object-position: top;
		background: #fff; /* screenshots */
	}
	.cap {
		padding: var(--sp-3) var(--sp-4);
		font-size: var(--fs-s);
		color: var(--fg-3);
		text-align: left;
	}
	.lightbox {
		position: fixed;
		inset: 0;
		z-index: 20000;
		display: grid;
		place-items: center;
		background: color-mix(in srgb, var(--bg) 88%, transparent);
		backdrop-filter: blur(6px);
		animation: appear var(--dur-2) both;
	}
	figure {
		margin: 0;
		max-width: 92vw;
		max-height: 88vh;
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
	}
	figure img {
		max-width: 92vw;
		max-height: 82vh;
		object-fit: contain;
		box-shadow: var(--shadow-pop);
		background: #fff; /* screenshots */
	}
	figcaption {
		text-align: center;
		color: var(--fg-2);
		font-size: var(--fs-m);
	}
	.x {
		position: absolute;
		top: 18px;
		right: 18px;
		width: 36px;
		height: 36px;
		border: var(--bw) solid var(--line);
		background: var(--surface-2);
		color: var(--fg);
		display: grid;
		place-items: center;
		cursor: pointer;
	}
</style>
