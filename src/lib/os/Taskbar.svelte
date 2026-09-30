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
		<Logo size={12} />
		<span>Start</span>
	</button>
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
				<Icon name={w.icon} size={12} />
				<span class="ellipsis">{w.title}</span>
			</button>
		{/each}
	</div>
	<div class="tray">
		{#if benchy.live}
			<button class="tray-btn" title="New run" onclick={() => wm.open('launcher')}
				><Icon name="play" size={12} /></button
			>
		{/if}
		<span class="clock"
			>{now.toLocaleDateString([], { day: '2-digit', month: '2-digit' })}
			{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span
		>
	</div>

	{#if startOpen}
		<div class="start-menu">
			<div class="sm-head">
				<Logo size={24} />
				<div>
					<div class="sm-title">BenchyOS</div>
					<div class="muted">
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
							<AppTile icon={a.icon} size={24} />
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
						<p class="muted">No runs yet.</p>
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
		gap: var(--sp-2);
		padding: 0 var(--sp-2);
		background: var(--surface-2);
		border-top: var(--bw) solid var(--line);
	}
	.start {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		height: var(--control-h);
		padding: 0 var(--sp-4);
		border: var(--bw) solid var(--line-strong);
		background: var(--surface-2);
		color: var(--fg);
		font-weight: var(--fw-strong);
		cursor: pointer;
	}
	.start:hover,
	.start.open {
		border-color: var(--fg-3);
	}
	.windows {
		flex: 1;
		display: flex;
		gap: var(--sp-2);
		min-width: 0;
		overflow: hidden;
	}
	.win-btn {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		min-width: 0;
		max-width: 200px;
		flex: 0 1 200px;
		height: var(--control-h);
		padding: 0 var(--sp-4);
		border: var(--bw) solid var(--line);
		border-bottom-width: 2px;
		background: var(--surface);
		color: var(--fg-3);
		font-size: var(--fs-s);
		cursor: pointer;
	}
	.win-btn:hover {
		color: var(--fg);
	}
	.win-btn.active {
		color: var(--fg);
		background: var(--surface-2);
		border-bottom-color: var(--accent);
	}
	.win-btn.min {
		color: var(--fg-4);
	}
	.tray {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		padding-left: var(--sp-4);
		border-left: var(--bw) solid var(--line);
		height: 100%;
	}
	.tray-btn {
		display: grid;
		place-items: center;
		width: var(--control-h);
		height: var(--control-h);
		border: var(--bw) solid var(--line);
		background: var(--surface);
		color: var(--fg-2);
		cursor: pointer;
	}
	.tray-btn:hover {
		color: var(--fg);
		border-color: var(--line-strong);
	}
	.clock {
		padding: 0 var(--sp-3);
		font-size: var(--fs-s);
		color: var(--fg-2);
		font-variant-numeric: tabular-nums;
	}
	.start-menu {
		position: absolute;
		left: var(--sp-2);
		bottom: calc(var(--taskbar-h) + var(--sp-2));
		width: 560px;
		max-width: calc(100vw - 16px);
		background: var(--surface);
		border: var(--bw) solid var(--line-strong);
		box-shadow: var(--shadow-pop);
		animation: step-unfold var(--dur-2) steps(var(--steps)) both;
	}
	.sm-head {
		display: flex;
		align-items: center;
		gap: var(--sp-4);
		padding: var(--sp-4) var(--sp-5);
		border-bottom: var(--bw) solid var(--line);
		background: var(--surface-2);
		font-size: var(--fs-s);
	}
	.sm-title {
		font-size: var(--fs-l);
		font-weight: var(--fw-strong);
	}
	.sm-body {
		display: grid;
		grid-template-columns: 1fr 200px;
	}
	.sm-apps {
		padding: var(--sp-2);
		display: grid;
		max-height: 60vh;
		overflow: auto;
	}
	.sm-app {
		display: flex;
		align-items: center;
		gap: var(--sp-4);
		padding: var(--sp-2) var(--sp-3);
		border: 0;
		background: transparent;
		color: var(--fg);
		text-align: left;
		cursor: pointer;
	}
	.sm-app:hover {
		background: var(--hover);
	}
	.sm-app b {
		display: block;
		font-weight: var(--fw-strong);
	}
	.sm-app small {
		display: block;
		color: var(--fg-3);
		font-size: var(--fs-s);
	}
	.sm-side {
		display: flex;
		flex-direction: column;
		gap: var(--sp-1);
		padding: var(--sp-4);
		border-left: var(--bw) solid var(--line);
		background: var(--surface-2);
	}
	.sm-run {
		display: flex;
		justify-content: space-between;
		gap: var(--sp-3);
		padding: var(--sp-2) var(--sp-3);
		border: 0;
		background: transparent;
		color: var(--fg-2);
		font-size: var(--fs-s);
		text-align: left;
		cursor: pointer;
	}
	.sm-run:hover {
		background: var(--hover);
		color: var(--fg);
	}
</style>
