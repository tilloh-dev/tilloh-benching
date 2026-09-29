<script lang="ts">
	import { onMount } from 'svelte';
	import { benchy } from '../data/store.svelte.ts';
	import AppTile from './AppTile.svelte';
	import Icon from './Icon.svelte';
	import Logo from './Logo.svelte';
	import { wm } from './wm.svelte.ts';

	let startOpen = $state(false);
	let now = $state(new Date());
	let root: HTMLElement | undefined = $state();

	onMount(() => {
		const t = setInterval(() => (now = new Date()), 10_000);
		return () => clearInterval(t);
	});

	const apps = $derived(
		[...wm.apps.values()].filter((a) => a.desktop !== false && (benchy.live || !a.liveOnly))
	);
	const recentRuns = $derived(benchy.runs.slice(0, 5));
	const focusedId = $derived(wm.focused?.id);

	function onDoc(e: PointerEvent) {
		if (startOpen && root && !root.contains(e.target as Node)) startOpen = false;
	}
</script>

<svelte:document onpointerdown={onDoc} />

<footer class="taskbar" bind:this={root}>
	<button class="start" class:open={startOpen} onclick={() => (startOpen = !startOpen)}>
		<Logo size={22} />
		<span>Start</span>
	</button>
	<div class="sep"></div>
	<div class="windows">
		{#each wm.windows.filter((w) => w.phase !== 'closing') as w (w.id)}
			<button
				class="win-btn"
				class:active={focusedId === w.id && w.state !== 'minimized'}
				class:min={w.state === 'minimized'}
				data-taskbar={w.id}
				onclick={() => wm.toggleFromTaskbar(w.id)}
				title={w.title}
			>
				<Icon name={w.icon} size={15} />
				<span class="ellipsis">{w.title}</span>
			</button>
		{/each}
	</div>
	<div class="tray">
		{#if benchy.live}
			<button class="tray-btn" title="New run" onclick={() => wm.open('launcher')}
				><Icon name="play" size={15} /></button
			>
		{/if}
		<div class="clock">
			<b>{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</b>
			<span>{now.toLocaleDateString([], { day: '2-digit', month: 'short' })}</span>
		</div>
	</div>

	{#if startOpen}
		<div class="start-menu">
			<div class="sm-head">
				<Logo size={34} />
				<div>
					<div class="sm-title">Benchy</div>
					<div class="muted small">
						{benchy.status?.host.name ?? ''} · {benchy.live ? 'live' : 'static export'}
					</div>
				</div>
			</div>
			<div class="sm-body">
				<div class="sm-apps">
					{#each apps as a (a.id)}
						<button
							class="sm-app"
							onclick={() => {
								startOpen = false;
								wm.open(a.id);
							}}
						>
							<AppTile icon={a.icon} hue={a.hue} size={34} />
							<span class="grow">
								<b>{a.title}</b>
								{#if a.description}<small>{a.description}</small>{/if}
							</span>
						</button>
					{/each}
				</div>
				<div class="sm-side">
					<div class="section-title">Recent runs</div>
					{#each recentRuns as r (r.id)}
						<button
							class="sm-run"
							onclick={() => {
								startOpen = false;
								wm.open('runs', { select: r.id });
							}}
						>
							<span class="ellipsis">{r.label ?? r.id}</span>
							<small class="muted"
								>{r.mean_score !== null ? r.mean_score.toFixed(1) : r.status}</small
							>
						</button>
					{:else}
						<p class="muted small">No runs yet.</p>
					{/each}
				</div>
			</div>
		</div>
	{/if}
</footer>

<style>
	.taskbar {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 20000;
		height: var(--taskbar-h);
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 0 8px;
		background:
			linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0) 45%),
			linear-gradient(180deg, rgba(16, 25, 58, 0.96), rgba(8, 13, 32, 0.98));
		border-top: 1px solid var(--line-strong);
		backdrop-filter: blur(14px);
		box-shadow: 0 -10px 30px rgba(0, 0, 0, 0.35);
	}
	.start {
		display: flex;
		align-items: center;
		gap: 8px;
		height: 38px;
		padding: 0 16px 0 10px;
		border-radius: 10px;
		border: 1px solid var(--yellow-deep);
		background:
			linear-gradient(180deg, rgba(255, 255, 255, 0.35), rgba(255, 255, 255, 0) 55%),
			linear-gradient(180deg, #ffd23f, #e0a800);
		color: var(--yellow-ink);
		font-weight: 700;
		letter-spacing: 0.01em;
		cursor: pointer;
		box-shadow:
			0 0 18px rgba(255, 210, 63, 0.35),
			0 1px 0 rgba(255, 255, 255, 0.4) inset;
		transition:
			box-shadow 0.2s,
			transform 0.1s;
	}
	.start :global(.logo) {
		filter: drop-shadow(0 1px 0 rgba(0, 0, 0, 0.3));
	}
	.start:hover,
	.start.open {
		box-shadow:
			0 0 28px rgba(255, 210, 63, 0.6),
			0 1px 0 rgba(255, 255, 255, 0.5) inset;
	}
	.start:active {
		transform: translateY(1px);
	}
	.sep {
		width: 1px;
		height: 30px;
		background: var(--line);
		margin: 0 4px;
	}
	.windows {
		flex: 1;
		display: flex;
		gap: 5px;
		min-width: 0;
		overflow: hidden;
	}
	.win-btn {
		display: flex;
		align-items: center;
		gap: 8px;
		min-width: 0;
		max-width: 210px;
		flex: 0 1 210px;
		height: 38px;
		padding: 0 12px;
		border-radius: 9px;
		border: 1px solid var(--line-soft);
		background: linear-gradient(180deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0));
		color: var(--text-2);
		cursor: pointer;
		font-size: 12.5px;
		position: relative;
		transition:
			background 0.15s,
			border-color 0.15s,
			color 0.15s;
		animation: fade-up 0.2s both;
	}
	.win-btn:hover {
		background: var(--bg-4);
		color: var(--text);
	}
	.win-btn.active {
		background: linear-gradient(180deg, #1f2f6e, #172458);
		border-color: var(--line-strong);
		color: var(--text);
	}
	.win-btn.active::after {
		content: '';
		position: absolute;
		left: 12px;
		right: 12px;
		bottom: 3px;
		height: 2px;
		border-radius: 2px;
		background: var(--yellow);
		box-shadow: 0 0 10px var(--yellow);
	}
	.win-btn.min {
		opacity: 0.6;
	}
	.tray {
		display: flex;
		align-items: center;
		gap: 6px;
		padding-left: 10px;
		border-left: 1px solid var(--line-soft);
		height: 34px;
	}
	.tray-btn {
		display: grid;
		place-items: center;
		width: 32px;
		height: 32px;
		border-radius: 8px;
		border: 1px solid var(--line);
		background: var(--bg-3);
		color: var(--yellow);
		cursor: pointer;
	}
	.tray-btn:hover {
		box-shadow: var(--glow);
	}
	.clock {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		line-height: 1.15;
		padding: 0 6px;
		font-size: 11px;
		color: var(--text-3);
		font-variant-numeric: tabular-nums;
	}
	.clock b {
		font-size: 13px;
		color: var(--text);
		font-weight: 600;
	}

	.start-menu {
		position: absolute;
		left: 8px;
		bottom: calc(var(--taskbar-h) + 6px);
		width: 620px;
		max-width: calc(100vw - 16px);
		border-radius: var(--radius-l);
		background: rgba(14, 22, 52, 0.98);
		border: 1px solid var(--line-strong);
		box-shadow:
			var(--shadow-pop),
			0 0 40px rgba(255, 210, 63, 0.08);
		overflow: hidden;
		animation: sm-in 0.2s var(--ease-out) both;
		transform-origin: bottom left;
	}
	@keyframes sm-in {
		from {
			opacity: 0;
			transform: translateY(12px) scale(0.97);
		}
	}
	.sm-head {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 14px 16px;
		background: linear-gradient(90deg, rgba(255, 210, 63, 0.14), transparent 70%);
		border-bottom: 1px solid var(--line);
	}
	.sm-title {
		font-size: 17px;
		font-weight: 700;
	}
	.small {
		font-size: 12px;
	}
	.sm-body {
		display: grid;
		grid-template-columns: 1fr 210px;
	}
	.sm-apps {
		padding: 8px;
		display: grid;
		gap: 2px;
		max-height: 60vh;
		overflow: auto;
	}
	.sm-app {
		display: flex;
		align-items: center;
		gap: 11px;
		padding: 6px 8px;
		border: 0;
		border-radius: 9px;
		background: transparent;
		text-align: left;
		cursor: pointer;
		color: var(--text);
	}
	.sm-app:hover {
		background: linear-gradient(90deg, var(--yellow-a20), var(--yellow-a10));
	}
	.sm-app b {
		display: block;
		font-weight: 600;
		font-size: 13px;
	}
	.sm-app small {
		display: block;
		color: var(--text-3);
		font-size: 11.5px;
	}
	.sm-side {
		padding: 12px;
		background: var(--bg-2);
		border-left: 1px solid var(--line);
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.sm-run {
		display: flex;
		justify-content: space-between;
		gap: 8px;
		padding: 6px 8px;
		border: 0;
		border-radius: 7px;
		background: transparent;
		color: var(--text-2);
		cursor: pointer;
		text-align: left;
		font-size: 12px;
	}
	.sm-run:hover {
		background: var(--bg-4);
		color: var(--text);
	}
</style>
