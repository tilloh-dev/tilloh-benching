<script lang="ts">
	import { onMount } from 'svelte';
	import { benchy } from '../data/store.svelte.ts';
	import { APPS } from '../apps/registry.ts';
	import AppTile from './AppTile.svelte';
	import Boot from './Boot.svelte';
	import CommandPalette from './CommandPalette.svelte';
	import Taskbar from './Taskbar.svelte';
	import Toasts from './Toasts.svelte';
	import TopBar from './TopBar.svelte';
	import Window from './Window.svelte';
	import { wm } from './wm.svelte.ts';

	wm.register(APPS);

	let palette = $state(false);
	let selected = $state<string | null>(null);
	let booted = $state(false);

	const icons = $derived(APPS.filter((a) => a.desktop !== false && (benchy.live || !a.liveOnly)));

	onMount(() => {
		benchy.init().then(() => {
			setTimeout(() => (booted = true), 350);
			// Hash router: the query lives inside the hash (#/?open=attempt:…).
			const open = new URLSearchParams(location.hash.split('?')[1] ?? '').get('open');
			if (open) {
				const [kind, ...rest] = open.split(':');
				const id = rest.join(':');
				if (kind === 'attempt' && id) wm.open('attempt', { key: id, id });
				else if (kind === 'run' && id) wm.open('runs', { select: id });
				else if (wm.apps.has(kind)) wm.open(kind);
			} else {
				let seen = false;
				try {
					seen = localStorage.getItem('benchy.welcomed') === '1';
					localStorage.setItem('benchy.welcomed', '1');
				} catch {
					/* private mode */
				}
				wm.open(seen && benchy.attempts.length ? 'leaderboard' : 'welcome');
			}
		});
	});

	function onKey(e: KeyboardEvent) {
		if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
			e.preventDefault();
			palette = !palette;
		}
	}
</script>

<svelte:window onkeydown={onKey} />

<Boot done={booted} error={benchy.error} />

<main class="desktop" onpointerdown={(e) => e.target === e.currentTarget && (selected = null)}>
	<div class="wallpaper" aria-hidden="true">
		<div class="glow g1"></div>
		<div class="glow g2"></div>
		<div class="grid"></div>
		<div class="mark">benchy</div>
	</div>

	<nav class="icons" class:in={booted} aria-label="Desktop">
		{#each icons as app, i (app.id)}
			<button
				class="desk-icon"
				class:selected={selected === app.id}
				style="animation-delay:{120 + i * 45}ms"
				onclick={() => (selected = app.id)}
				ondblclick={() => wm.open(app.id)}
				onkeydown={(e) => e.key === 'Enter' && wm.open(app.id)}
				title={app.description}
			>
				<AppTile icon={app.icon} hue={app.hue} />
				<span class="name">{app.title}</span>
			</button>
		{/each}
	</nav>

	{#each wm.windows as win (win.id)}
		{@const def = wm.apps.get(win.app)}
		{#if def}
			<Window {win}>
				<def.component {win} props={win.props} />
			</Window>
		{/if}
	{/each}
</main>

<TopBar onpalette={() => (palette = true)} />
<Taskbar />
<CommandPalette bind:open={palette} />
<Toasts />

<style>
	.desktop {
		position: fixed;
		inset: var(--topbar-h) 0 var(--taskbar-h) 0;
		overflow: hidden;
	}
	.wallpaper {
		position: absolute;
		inset: calc(-1 * var(--topbar-h)) 0 calc(-1 * var(--taskbar-h)) 0;
		background:
			radial-gradient(120% 80% at 50% 120%, #0f1a45 0%, transparent 60%),
			linear-gradient(180deg, #060b1d 0%, #0a1230 55%, #0b1438 100%);
		pointer-events: none;
	}
	.glow {
		position: absolute;
		border-radius: 50%;
		filter: blur(60px);
	}
	.g1 {
		width: 620px;
		height: 620px;
		right: -120px;
		top: -160px;
		background: radial-gradient(circle, rgba(255, 210, 63, 0.16), transparent 65%);
		animation: drift 18s ease-in-out infinite alternate;
	}
	.g2 {
		width: 700px;
		height: 500px;
		left: -200px;
		bottom: -180px;
		background: radial-gradient(circle, rgba(70, 110, 255, 0.18), transparent 65%);
		animation: drift 22s ease-in-out infinite alternate-reverse;
	}
	@keyframes drift {
		to {
			transform: translate(-60px, 40px) scale(1.08);
		}
	}
	.grid {
		position: absolute;
		inset: 0;
		background-image: radial-gradient(rgba(140, 160, 255, 0.13) 1px, transparent 1.2px);
		background-size: 26px 26px;
		mask-image: radial-gradient(80% 70% at 55% 45%, #000 40%, transparent 100%);
	}
	.mark {
		position: absolute;
		right: 48px;
		bottom: calc(var(--taskbar-h) + 30px);
		font-size: 120px;
		font-weight: 700;
		letter-spacing: -0.05em;
		color: transparent;
		-webkit-text-stroke: 1px rgba(255, 210, 63, 0.09);
		user-select: none;
	}

	.icons {
		position: absolute;
		top: 16px;
		left: 14px;
		bottom: 16px;
		display: grid;
		grid-auto-flow: column;
		grid-template-rows: repeat(auto-fill, 98px);
		grid-auto-columns: 96px;
		gap: 6px 8px;
		align-content: start;
	}
	.desk-icon {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 7px;
		padding: 8px 4px 6px;
		border-radius: 12px;
		border: 1px solid transparent;
		background: transparent;
		color: var(--text);
		cursor: default;
		opacity: 0;
	}
	.icons.in .desk-icon {
		animation: icon-in 0.4s var(--ease-spring) both;
	}
	@keyframes icon-in {
		from {
			opacity: 0;
			transform: translateY(10px) scale(0.9);
		}
		to {
			opacity: 1;
			transform: none;
		}
	}
	.desk-icon:hover {
		background: rgba(255, 255, 255, 0.04);
	}
	.desk-icon:hover :global(.tile) {
		transform: translateY(-2px) scale(1.04);
	}
	.desk-icon.selected {
		background: var(--yellow-a10);
		border-color: var(--yellow-a35);
	}
	.desk-icon.selected :global(.tile) {
		box-shadow:
			0 0 0 2px var(--yellow),
			0 0 24px rgba(255, 210, 63, 0.45);
	}
	.name {
		font-size: 12px;
		font-weight: 500;
		text-align: center;
		line-height: 1.25;
		text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9);
	}
	.selected .name {
		color: var(--yellow-2);
	}
</style>
