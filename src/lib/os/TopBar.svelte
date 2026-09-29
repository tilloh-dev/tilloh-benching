<script lang="ts">
	import { benchy } from '../data/store.svelte.ts';
	import Icon from './Icon.svelte';
	import Logo from './Logo.svelte';
	import Menu, { type MenuItem } from './Menu.svelte';
	import { wm } from './wm.svelte.ts';
	import { toasts } from './toasts.svelte.ts';

	let { onpalette }: { onpalette: () => void } = $props();

	const llama = $derived(benchy.status?.engine?.llama);
	const activeRuns = $derived(benchy.runs.filter((r) => r.status === 'running'));
	const progress = $derived.by(() => {
		if (!activeRuns.length) return null;
		const total = activeRuns.reduce((a, r) => a + r.counts.total, 0);
		const done = activeRuns.reduce(
			(a, r) => a + (r.judge === 'none' ? r.counts.generated : r.counts.judged) + r.counts.failed,
			0
		);
		return total ? Math.round((done / total) * 100) : 0;
	});
	const ledTone = $derived(
		!llama
			? 'off'
			: llama.state === 'ready'
				? 'ok'
				: llama.state === 'loading' || llama.state === 'starting'
					? 'busy'
					: llama.state === 'error'
						? 'bad'
						: 'off'
	);
	const gpu = $derived(
		benchy.status?.host.gpus[0]?.replace(/^(NVIDIA|Vulkan)\s+/, '').replace(/,.*$/, '') ?? null
	);

	const appItems = $derived<MenuItem[]>(
		[...wm.apps.values()]
			.filter((a) => a.desktop !== false && (benchy.live || !a.liveOnly))
			.map((a) => ({ label: a.title, icon: a.icon, action: () => wm.open(a.id) }))
	);
	const windowItems = $derived<MenuItem[]>(
		wm.windows.length
			? [
					...wm.windows.map(
						(w) => ({ label: w.title, icon: w.icon, action: () => wm.restore(w.id) }) as MenuItem
					),
					'sep',
					{ label: 'Close all windows', icon: 'close', action: () => wm.closeAll() }
				]
			: [{ label: 'No open windows', disabled: true, action: () => {} }]
	);
	const benchyItems = $derived<MenuItem[]>([
		{ label: 'About Benchy', icon: 'info', action: () => wm.open('welcome') },
		{ label: 'Host & llama.cpp', icon: 'chip', action: () => wm.open('host') },
		'sep',
		{
			label: 'Rescan results',
			icon: 'refresh',
			disabled: !benchy.live,
			action: async () => {
				await benchy.api.rescan();
				await benchy.refresh();
				toasts.push('ok', 'Results rescanned');
			}
		},
		{ label: 'Reset window layout', icon: 'grid', action: () => wm.resetLayout() },
		{ label: 'Command palette', icon: 'search', hint: 'Ctrl K', action: onpalette }
	]);
</script>

<header class="topbar">
	<Menu items={benchyItems}>
		{#snippet trigger()}
			<Logo size={20} />
			<span class="brand">benchy</span>
		{/snippet}
	</Menu>
	<Menu items={appItems}>
		{#snippet trigger()}Apps{/snippet}
	</Menu>
	<Menu items={windowItems}>
		{#snippet trigger()}Window{/snippet}
	</Menu>

	<span class="spacer"></span>

	{#if benchy.client && !benchy.live}
		<span class="chip static" title="Read-only export"
			><Icon name="eye" size={14} />static export</span
		>
	{/if}
	{#if benchy.status}
		<button class="chip" title="Host" onclick={() => wm.open('host')}>
			<Icon name="chip" size={14} />
			<span>{benchy.status.host.name}</span>
			{#if gpu}<span class="muted ellipsis gpu">{gpu}</span>{/if}
		</button>
	{/if}
	{#if benchy.live}
		<button
			class="chip"
			title="llama-server: {llama?.state ?? 'unknown'}{llama?.loaded ? ` · ${llama.loaded}` : ''}"
			onclick={() => wm.open('host')}
		>
			<i class="led {ledTone}"></i>
			<span>llama</span>
			{#if llama?.loaded}<span class="muted ellipsis loaded">{llama.loaded}</span>{/if}
		</button>
		{#if progress !== null}
			<button class="chip run" onclick={() => wm.open('runs', { select: activeRuns[0]?.id })}>
				<Icon name="rocket" size={14} />
				<span>{activeRuns.length} running</span>
				<span class="bar"><span style="width:{progress}%"></span></span>
				<span class="mono">{progress}%</span>
			</button>
		{/if}
		{#if (benchy.status?.engine?.judge_jobs ?? 0) > 0}
			<span class="chip"><Icon name="gavel" size={14} />{benchy.status?.engine?.judge_jobs}</span>
		{/if}
		<span
			class="conn"
			class:on={benchy.connected}
			title={benchy.connected ? 'live' : 'reconnecting…'}
		></span>
	{/if}
	<button class="chip search" onclick={onpalette} title="Search (Ctrl K)">
		<Icon name="search" size={14} />
		<span class="muted">Search</span>
		<kbd>Ctrl K</kbd>
	</button>
</header>

<style>
	.topbar {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		z-index: 20000;
		height: var(--topbar-h);
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 0 10px;
		background: linear-gradient(180deg, rgba(14, 22, 52, 0.94), rgba(10, 16, 40, 0.94));
		border-bottom: 1px solid var(--line);
		backdrop-filter: blur(14px);
		box-shadow: 0 1px 0 rgba(255, 255, 255, 0.04) inset;
	}
	.brand {
		font-weight: 700;
		letter-spacing: -0.01em;
		color: var(--text);
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		height: 26px;
		padding: 0 10px;
		border-radius: 999px;
		border: 1px solid var(--line-soft);
		background: rgba(255, 255, 255, 0.02);
		color: var(--text-2);
		font-size: 12px;
		cursor: pointer;
		max-width: 300px;
		transition:
			border-color 0.15s,
			background 0.15s;
	}
	.chip:hover {
		border-color: var(--line-strong);
		background: var(--bg-4);
		color: var(--text);
	}
	.chip.static {
		color: var(--yellow-2);
		border-color: var(--yellow-a35);
		cursor: default;
	}
	.gpu,
	.loaded {
		max-width: 150px;
	}
	.led {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--muted);
		color: var(--muted);
	}
	.led.ok {
		background: var(--ok);
		color: var(--ok);
		box-shadow: 0 0 8px var(--ok);
	}
	.led.busy {
		background: var(--yellow);
		color: var(--yellow);
		animation: pulse-led 1s ease-in-out infinite;
	}
	.led.bad {
		background: var(--bad);
		color: var(--bad);
		box-shadow: 0 0 8px var(--bad);
	}
	.run {
		border-color: var(--yellow-a35);
		color: var(--yellow-2);
	}
	.bar {
		width: 60px;
		height: 5px;
		border-radius: 5px;
		background: var(--bg-1);
		overflow: hidden;
	}
	.bar span {
		display: block;
		height: 100%;
		background: linear-gradient(
			90deg,
			var(--yellow-deep),
			var(--yellow),
			var(--yellow-2),
			var(--yellow)
		);
		background-size: 200% 100%;
		animation: shimmer 1.6s linear infinite;
		transition: width 0.4s var(--ease-out);
	}
	.conn {
		width: 7px;
		height: 7px;
		margin: 0 6px;
		border-radius: 50%;
		background: var(--bad);
	}
	.conn.on {
		background: var(--ok);
		box-shadow: 0 0 6px var(--ok);
	}
	.search kbd {
		margin-left: 6px;
	}
</style>
