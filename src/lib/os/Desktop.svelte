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
	import { theme } from '../design/theme.svelte.ts';

	wm.register(APPS);

	let palette = $state(false);
	let selected = $state<string | null>(null);
	let booted = $state(false);

	const icons = $derived(APPS.filter((a) => a.desktop !== false && (benchy.live || !a.liveOnly)));

	onMount(() => {
		theme.init();
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
	<div class="wallpaper" aria-hidden="true"><span class="mark">BenchyOS</span></div>

	<nav class="icons" class:in={booted} aria-label="Desktop">
		{#each icons as app, i (app.id)}
			<button
				class="desk-icon"
				class:selected={selected === app.id}
				style="animation-delay:{i * 40}ms"
				onclick={() => (selected = app.id)}
				ondblclick={() => wm.open(app.id)}
				onkeydown={(e) => e.key === 'Enter' && wm.open(app.id)}
				title={app.description}
			>
				<AppTile icon={app.icon} size={48} selected={selected === app.id} />
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
		inset: 0;
		background: var(--bg);
		pointer-events: none;
	}
	.mark {
		position: absolute;
		right: var(--sp-7);
		bottom: var(--sp-6);
		font-size: var(--fs-xxl);
		font-weight: var(--fw-strong);
		color: var(--line-soft);
		user-select: none;
	}
	.icons {
		position: absolute;
		top: var(--sp-5);
		left: var(--sp-5);
		bottom: var(--sp-5);
		display: grid;
		grid-auto-flow: column;
		grid-template-rows: repeat(auto-fill, 84px);
		grid-auto-columns: 88px;
		gap: var(--sp-3);
		align-content: start;
	}
	.desk-icon {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--sp-2);
		padding: var(--sp-2);
		border: var(--bw) solid transparent;
		background: transparent;
		color: var(--fg-2);
		cursor: default;
		opacity: 0;
	}
	.icons.in .desk-icon {
		animation: appear var(--dur-3) steps(var(--steps)) both;
	}
	.icons.in .desk-icon {
		opacity: 1;
	}
	.desk-icon:hover {
		color: var(--fg);
	}
	.name {
		font-size: var(--fs-s);
		text-align: center;
		line-height: 1.2;
	}
	.selected .name {
		color: var(--fg);
		background: var(--accent-soft);
		padding: 0 var(--sp-1);
	}
</style>
