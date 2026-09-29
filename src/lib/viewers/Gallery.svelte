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
		<button class="x" aria-label="Close"><Icon name="close" size={18} /></button>
	</div>
{/if}

<style>
	.gallery {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
		gap: 10px;
	}
	.thumb {
		display: flex;
		flex-direction: column;
		padding: 0;
		border: 1px solid var(--line-soft);
		border-radius: var(--radius);
		background: var(--bg-1);
		overflow: hidden;
		cursor: zoom-in;
		animation: fade-up 0.3s both;
		transition:
			border-color 0.15s,
			transform 0.2s var(--ease-out),
			box-shadow 0.2s;
	}
	.thumb:hover {
		border-color: var(--yellow-a35);
		transform: translateY(-2px);
		box-shadow: var(--glow-soft);
	}
	.thumb img {
		width: 100%;
		aspect-ratio: 16 / 10;
		object-fit: cover;
		object-position: top;
		background: #fff;
	}
	.cap {
		padding: 6px 9px;
		font-size: 11.5px;
		color: var(--text-3);
		text-align: left;
	}
	.lightbox {
		position: fixed;
		inset: 0;
		z-index: 20000;
		display: grid;
		place-items: center;
		background: rgba(3, 6, 14, 0.82);
		backdrop-filter: blur(6px);
		animation: fade-up 0.15s both;
	}
	figure {
		margin: 0;
		max-width: 92vw;
		max-height: 88vh;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	figure img {
		max-width: 92vw;
		max-height: 82vh;
		object-fit: contain;
		border-radius: 10px;
		box-shadow: var(--shadow-pop);
		background: #fff;
	}
	figcaption {
		text-align: center;
		color: var(--text-2);
		font-size: 13px;
	}
	.x {
		position: absolute;
		top: 18px;
		right: 18px;
		width: 36px;
		height: 36px;
		border-radius: 50%;
		border: 1px solid var(--line);
		background: var(--bg-3);
		color: var(--text);
		display: grid;
		place-items: center;
		cursor: pointer;
	}
</style>
