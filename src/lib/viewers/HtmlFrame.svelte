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
			><Icon name="refresh" size={14} /></button
		>
		<button class="tb" title="Fullscreen" onclick={() => frame?.requestFullscreen()}
			><Icon name="maximize" size={13} /></button
		>
		<a class="tb" href={src} target="_blank" rel="noopener noreferrer" title="Open in new tab"
			><Icon name="external" size={14} /></a
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
		border: 1px solid var(--line-soft);
		border-radius: var(--radius);
		overflow: hidden;
		background: var(--bg-0);
	}
	.bar {
		flex: none;
		display: flex;
		align-items: center;
		gap: 4px;
		height: 34px;
		padding: 0 6px 0 10px;
		background: var(--bg-3);
		border-bottom: 1px solid var(--line-soft);
	}
	.url {
		font-size: 11.5px;
		color: var(--text-3);
		padding: 3px 10px;
		border-radius: 999px;
		background: var(--bg-1);
		border: 1px solid var(--line-soft);
		max-width: 50%;
	}
	.tb {
		display: grid;
		place-items: center;
		height: 24px;
		min-width: 26px;
		padding: 0 7px;
		border-radius: 6px;
		border: 1px solid transparent;
		background: transparent;
		color: var(--text-3);
		font-size: 11px;
		cursor: pointer;
		text-decoration: none;
	}
	.tb:hover {
		background: var(--bg-4);
		color: var(--text);
		text-decoration: none;
	}
	.tb.on {
		color: var(--yellow-2);
		border-color: var(--line);
		background: var(--bg-2);
	}
	.stage {
		flex: 1;
		min-height: 0;
		display: flex;
		justify-content: center;
		background: repeating-conic-gradient(#0b1230 0% 25%, #0e1638 0% 50%) 50% / 22px 22px;
	}
	iframe {
		height: 100%;
		border: 0;
		background: #fff;
		transition: width 0.25s var(--ease-out);
		max-width: 100%;
	}
</style>
