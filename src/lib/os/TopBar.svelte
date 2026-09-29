<script lang="ts">
	import { benchy } from '../data/store.svelte.ts';
	import Icon from './Icon.svelte';
	import Logo from './Logo.svelte';
	import Menu, { type MenuItem } from './Menu.svelte';
	import { wm } from './wm.svelte.ts';
	import { toasts } from './toasts.svelte.ts';
	import { theme } from '../design/theme.svelte.ts';

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
		{ label: 'About BenchyOS', icon: 'info', action: () => wm.open('welcome') },
		{ label: 'Host & llama.cpp', icon: 'chip', action: () => wm.open('host') },
		{ label: 'Design system', icon: 'grid', action: () => wm.open('design') },
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
			<Logo size={12} />
			<span class="brand">BenchyOS</span>
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
			><Icon name="eye" size={12} />static export</span
		>
	{/if}
	{#if benchy.status}
		<button class="chip" title="Host" onclick={() => wm.open('host')}>
			<Icon name="chip" size={12} />
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
				<Icon name="rocket" size={12} />
				<span>{activeRuns.length} running</span>
				<span class="bar"><span style="width:{progress}%"></span></span>
				<span class="mono">{progress}%</span>
			</button>
		{/if}
		{#if (benchy.status?.engine?.judge_jobs ?? 0) > 0}
			<span class="chip"><Icon name="gavel" size={12} />{benchy.status?.engine?.judge_jobs}</span>
		{/if}
		<span
			class="conn"
			class:on={benchy.connected}
			title={benchy.connected ? 'live' : 'reconnecting…'}
		></span>
	{/if}
	<button
		class="chip"
		title="Theme: {theme.choice} (click to change)"
		onclick={() => theme.cycle()}
	>
		<Icon name={theme.resolved === 'light' ? 'sun' : 'moon'} size={12} />
		<span>{theme.choice}</span>
	</button>
	<button class="chip search" onclick={onpalette} title="Search (Ctrl K)">
		<Icon name="search" size={12} />
		<span class="muted">search</span>
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
		gap: var(--sp-2);
		padding: 0 var(--sp-3);
		background: var(--surface);
		border-bottom: var(--bw) solid var(--line);
	}
	.brand {
		font-weight: var(--fw-strong);
		color: var(--fg);
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-3);
		height: var(--control-h-s);
		padding: 0 var(--sp-3);
		border: var(--bw) solid var(--line);
		background: var(--surface);
		color: var(--fg-2);
		font-size: var(--fs-s);
		cursor: pointer;
		max-width: 300px;
		transition: border-color var(--dur-1);
	}
	.chip:hover {
		border-color: var(--line-strong);
		color: var(--fg);
	}
	.chip.static {
		cursor: default;
	}
	.gpu,
	.loaded {
		max-width: 150px;
	}
	.led {
		width: 6px;
		height: 6px;
		background: var(--muted);
	}
	.led.ok {
		background: var(--ok);
	}
	.led.busy {
		background: var(--fg);
		animation: blink var(--dur-3) steps(2) infinite;
	}
	.led.bad {
		background: var(--bad);
	}
	.bar {
		width: 56px;
		height: 6px;
		background: var(--track);
	}
	.bar span {
		display: block;
		height: 100%;
		background: var(--data);
		transition: width var(--dur-2);
	}
	.conn {
		width: 6px;
		height: 6px;
		margin: 0 var(--sp-2);
		background: var(--bad);
	}
	.conn.on {
		background: var(--ok);
	}
	.search kbd {
		margin-left: var(--sp-2);
	}
</style>
