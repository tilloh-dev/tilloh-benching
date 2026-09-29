<script lang="ts">
	import Icon from '../os/Icon.svelte';

	/** Renders a generated page in a sandboxed iframe: scripts run, but with an opaque origin. */
	let { src, title = 'artifact' }: { src: string; title?: string } = $props();
	let nonce = $state(0);
	let device = $state<'desktop' | 'tablet' | 'phone'>('desktop');
	const widths = { desktop: '100%', tablet: '820px', phone: '390px' };
	let frame: HTMLIFrameElement | undefined = $state();
</script>

<div class="frame-wrap">
	<div class="bar">
		<span class="url mono ellipsis">{title}</span>
		<span class="spacer"></span>
		{#each ['desktop', 'tablet', 'phone'] as d (d)}
			<button
				class="tb"
				class:on={device === d}
				onclick={() => (device = d as typeof device)}
				title={d}>{d}</button
			>
		{/each}
		<button class="tb" title="Reload" onclick={() => nonce++}
			><Icon name="refresh" size={12} /></button
		>
		<button class="tb" title="Fullscreen" onclick={() => frame?.requestFullscreen()}
			><Icon name="maximize" size={12} /></button
		>
		<a class="tb" href={src} target="_blank" rel="noopener noreferrer" title="Open in new tab"
			><Icon name="external" size={12} /></a
		>
	</div>
	<div class="stage">
		{#key nonce}
			<iframe
				bind:this={frame}
				{title}
				{src}
				style="width:{widths[device]}"
				sandbox="allow-scripts allow-pointer-lock allow-modals"
				allow="autoplay; fullscreen"
				referrerpolicy="no-referrer"
			></iframe>
		{/key}
	</div>
</div>

<style>
	.frame-wrap {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
		border: var(--bw) solid var(--line-soft);
		overflow: hidden;
		background: var(--sunken);
	}
	.bar {
		flex: none;
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		height: 34px;
		padding: 0 var(--sp-3) 0 var(--sp-5);
		background: var(--surface-2);
		border-bottom: var(--bw) solid var(--line-soft);
	}
	.url {
		font-size: var(--fs-s);
		color: var(--fg-3);
		padding: var(--sp-2) var(--sp-5);
		background: var(--sunken);
		border: var(--bw) solid var(--line-soft);
		max-width: 50%;
	}
	.tb {
		display: grid;
		place-items: center;
		height: 24px;
		min-width: 26px;
		padding: 0 var(--sp-4);
		border: var(--bw) solid transparent;
		background: transparent;
		color: var(--fg-3);
		font-size: var(--fs-xs);
		cursor: pointer;
		text-decoration: none;
	}
	.tb:hover {
		background: var(--hover);
		color: var(--fg);
		text-decoration: none;
	}
	.tb.on {
		border-color: var(--line);
		background: var(--surface);
		color: var(--fg);
	}
	.stage {
		flex: 1;
		min-height: 0;
		display: flex;
		justify-content: center;
		background: var(--sunken);
	}
	iframe {
		height: 100%;
		border: 0;
		background: #fff; /* artifacts expect the browser default canvas */
		transition: width var(--dur-3) var(--ease);
		max-width: 100%;
	}
</style>
