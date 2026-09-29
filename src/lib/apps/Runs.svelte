<script lang="ts">
	import type { RunRecord } from '$engine/core/schema.ts';
	import type { AttemptRow } from '$engine/core/rows.ts';
	import type { Win } from '../os/wm.svelte.ts';
	import { wm } from '../os/wm.svelte.ts';
	import { benchy } from '../data/store.svelte.ts';
	import { toasts } from '../os/toasts.svelte.ts';
	import Split from '../ui/Split.svelte';
	import ListItem from '../ui/ListItem.svelte';
	import Status from '../ui/Status.svelte';
	import Score from '../ui/Score.svelte';
	import Tabs from '../ui/Tabs.svelte';
	import Button from '../ui/Button.svelte';
	import Empty from '../ui/Empty.svelte';
	import Spinner from '../ui/Spinner.svelte';
	import Code from '../ui/Code.svelte';
	import JsonTree from '../ui/JsonTree.svelte';
	import Kind from '../ui/Kind.svelte';
	import { fmtAgo, fmtDate, fmtDuration, fmtNum } from '../ui/format.ts';
	import { scoreColor } from '../design/score.ts';

	let { win, props }: { win: Win; props: Record<string, unknown> } = $props();

	let selected = $state<string | null>(null);
	let tab = $state('matrix');
	let run = $state<RunRecord | null>(null);
	let loading = $state(false);
	let runLog = $state('');
	let llamaLog = $state('');
	let busy = $state<string | null>(null);
	let filter = $state('');

	$effect(() => {
		const want = props.select as string | undefined;
		if (want) selected = want;
		else if (!selected && benchy.runs.length) selected = benchy.runs[0].id;
	});

	const row = $derived(benchy.runs.find((r) => r.id === selected));
	const attempts = $derived(selected ? benchy.attemptsOf(selected) : []);
	const runs = $derived(
		benchy.runs.filter(
			(r) =>
				!filter ||
				`${r.label ?? ''} ${r.id} ${r.blueprints.join(' ')}`
					.toLowerCase()
					.includes(filter.toLowerCase())
		)
	);

	// Refetch the full run record when its row changes (status, llama props arrive during the run).
	$effect(() => {
		const id = selected;
		void row?.status;
		void row?.counts.generated;
		if (!id) return;
		loading = !run || run.id !== id;
		benchy.api
			.run(id)
			.then((d) => {
				if (selected === id) run = d.run;
			})
			.catch(() => (run = null))
			.finally(() => (loading = false));
	});

	$effect(() => {
		if (run) wm.setTitle(win.id, 'Runs', run.spec.label ?? run.id);
	});

	$effect(() => {
		if (!selected) return;
		if (tab === 'log') benchy.api.runLog(selected).then((t) => (runLog = t));
		if (tab === 'llama') benchy.api.llamaLog(selected).then((t) => (llamaLog = t));
	});

	const liveLog = $derived(
		benchy.logs.filter(
			(l) =>
				l.run_id === selected ||
				(l.run_id === null && l.message.startsWith('llama:') && row?.status === 'running')
		)
	);

	const matrix = $derived.by(() => {
		if (!run)
			return { bps: [] as string[], tests: [] as string[], cells: new Map<string, AttemptRow[]>() };
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- local to a $derived computation
		const cells = new Map<string, AttemptRow[]>();
		for (const a of attempts) {
			const k = `${a.blueprint_id}|${a.test_id}`;
			const list = cells.get(k) ?? [];
			list.push(a);
			cells.set(
				k,
				list.sort((x, y) => x.rep - y.rep)
			);
		}
		return { bps: run.spec.blueprints, tests: run.spec.tests, cells };
	});

	async function act(name: string, fn: () => Promise<unknown>, ok?: string) {
		busy = name;
		try {
			await fn();
			if (ok) toasts.push('ok', ok);
		} catch (e) {
			toasts.error(e);
		} finally {
			busy = null;
		}
	}

	const canStart = $derived(
		row &&
			['queued', 'interrupted', 'cancelled', 'failed', 'done'].includes(row.status) &&
			attempts.some(
				(a) =>
					a.stage === 'pending' ||
					a.stage === 'generating' ||
					(a.stage === 'generated' && !a.error) ||
					a.stage === 'checking'
			)
	);
	const unjudged = $derived(
		attempts.filter(
			(a) => a.score === null && !a.error && (a.stage === 'checked' || a.stage === 'judged')
		)
	);
	const failed = $derived(attempts.filter((a) => a.error));

	function progressOf(a: AttemptRow): string {
		const p = benchy.progress[a.id];
		if (!p) return '';
		return `${p.phase === 'reasoning' ? 'thinking' : 'writing'} ${(p.chars / 1000).toFixed(1)}k`;
	}

	function openAttempt(a: AttemptRow) {
		wm.open('attempt', { key: a.id, id: a.id });
	}
</script>

<Split width={300}>
	{#snippet side()}
		<div class="side-head">
			<input class="input" placeholder="Filter runs…" bind:value={filter} />
			{#if benchy.live}<Button
					icon="plus"
					variant="primary"
					size="sm"
					title="New run"
					onclick={() => wm.open('launcher')}
				/>{/if}
		</div>
		{#each runs as r (r.id)}
			<ListItem active={selected === r.id} onclick={() => (selected = r.id)}>
				<div class="row">
					<b class="ellipsis grow">{r.label ?? r.id}</b>
					<Status status={r.status} />
				</div>
				<div class="row meta">
					<span>{fmtAgo(r.created_at)}</span>·<span>{r.host}</span>·<span
						>{r.blueprints.length}×{r.tests.length}{r.repetitions > 1
							? `×${r.repetitions}`
							: ''}</span
					>
					<span class="spacer"></span>
					{#if r.mean_score !== null}<b class="mean" style="color:{scoreColor(r.mean_score)}"
							>{r.mean_score.toFixed(1)}</b
						>{/if}
				</div>
				{#if r.status === 'running'}
					<div class="mini">
						<span
							style="width:{r.counts.total
								? ((r.counts.judged + r.counts.failed) / r.counts.total) * 100
								: 0}%"
						></span>
					</div>
				{/if}
			</ListItem>
		{:else}
			<Empty icon="rocket" title="No runs"
				>{#if benchy.live}Start one with <b>New run</b>.{/if}</Empty
			>
		{/each}
	{/snippet}
	{#snippet main()}
		{#if !selected}
			<Empty icon="rocket" title="Select a run" />
		{:else if loading || !run || !row}
			<Spinner />
		{:else}
			<div class="head">
				<div class="grow">
					<div class="row">
						<h2 class="ellipsis">{run.spec.label ?? run.id}</h2>
						<Status status={row.status} />
					</div>
					<div class="row meta wrap">
						<span class="mono">{run.id}</span>·<span>{fmtDate(run.created_at)}</span>·<span
							>{run.host.name}{run.host.gpus[0] ? ` · ${run.host.gpus[0]}` : ''}</span
						>·<span>judge: {row.judge}</span>
						{#if run.started_at && run.finished_at}·<span
								>{fmtDuration(
									new Date(run.finished_at).getTime() - new Date(run.started_at).getTime()
								)}</span
							>{/if}
					</div>
					{#if run.spec.note}<p class="note">{run.spec.note}</p>{/if}
					{#if run.error}<p class="err">{run.error}</p>{/if}
				</div>
				<div class="stats">
					<div><b>{row.counts.total}</b><span>attempts</span></div>
					<div><b>{row.counts.judged}</b><span>judged</span></div>
					<div><b class:bad={row.counts.failed > 0}>{row.counts.failed}</b><span>failed</span></div>
					<div><Score value={row.mean_score} width={70} /><span>mean</span></div>
				</div>
			</div>
			{#if benchy.live}
				<div class="actions">
					{#if row.status === 'running'}
						<Button
							icon="stop"
							variant="danger"
							loading={busy === 'cancel'}
							onclick={() => act('cancel', () => benchy.api.cancelRun(run!.id), 'Cancel requested')}
							>Cancel</Button
						>
					{:else if canStart}
						<Button
							icon="play"
							variant="primary"
							loading={busy === 'start'}
							onclick={() => act('start', () => benchy.api.startRun(run!.id), 'Run resumed')}
							>{row.status === 'queued' ? 'Start' : 'Resume'}</Button
						>
					{/if}
					{#if failed.length && row.status !== 'running'}
						<Button
							icon="refresh"
							loading={busy === 'retry'}
							onclick={() =>
								act('retry', () => benchy.api.retryFailed(run!.id), 'Failed attempts reset')}
							>Retry {failed.length} failed</Button
						>
					{/if}
					{#if unjudged.length}
						<Button
							icon="gavel"
							loading={busy === 'judge'}
							onclick={() =>
								act(
									'judge',
									() => benchy.api.judge(unjudged.map((a) => a.id)),
									`Judging ${unjudged.length} attempt(s)`
								)}>Judge {unjudged.length} unjudged</Button
						>
					{/if}
					<Button icon="trophy" variant="ghost" onclick={() => wm.open('leaderboard')}
						>Leaderboard</Button
					>
					<span class="spacer"></span>
					{#if row.status !== 'running'}
						<Button
							icon="trash"
							variant="danger"
							size="sm"
							onclick={() => {
								if (confirm(`Delete run ${run!.id} and all its files?`))
									act(
										'delete',
										async () => {
											await benchy.api.deleteRun(run!.id);
											selected = null;
											await benchy.refresh();
										},
										'Run deleted'
									);
							}}>Delete</Button
						>
					{/if}
				</div>
			{/if}
			<Tabs
				bind:active={tab}
				tabs={[
					{ id: 'matrix', label: 'Matrix' },
					{ id: 'attempts', label: 'Attempts', count: attempts.length },
					{ id: 'llama', label: 'llama.cpp', disabled: !run.llama },
					{ id: 'log', label: 'Log' },
					{ id: 'spec', label: 'Spec' }
				]}
			/>
			<div class="tab-body scroll">
				{#if tab === 'matrix'}
					<div class="matrix" style="--cols:{matrix.tests.length}">
						<div></div>
						{#each matrix.tests as t (t)}<div class="th" title={benchy.testTitle(t)}>
								{t}
							</div>{/each}
						{#each matrix.bps as bp (bp)}
							<div class="rh">
								<b class="ellipsis">{run.blueprints[bp]?.blueprint.label ?? bp}</b>
								<Kind kind={run.blueprints[bp]?.blueprint.kind ?? 'dry-run'} />
							</div>
							{#each matrix.tests as t (t)}
								<div class="cell">
									{#each matrix.cells.get(`${bp}|${t}`) ?? [] as a (a.id)}
										<button
											class="rep st-{a.error ? 'failed' : a.stage}"
											style={a.score !== null ? `--c:${scoreColor(a.score)}` : ''}
											onclick={() => openAttempt(a)}
											title="#{a.rep} · {a.stage}{a.status ? ` · ${a.status}` : ''}{a.error
												? ` · ${a.error}`
												: ''}"
										>
											{#if a.score !== null}
												<b>{a.score.toFixed(0)}</b>
											{:else if a.error}
												<span>✕</span>
											{:else if a.stage === 'generating'}
												<span class="live">{progressOf(a) || '…'}</span>
											{:else}
												<span>{a.stage === 'pending' ? '·' : a.stage}</span>
											{/if}
											{#if a.gate_failed}<i class="gate"></i>{/if}
										</button>
									{/each}
								</div>
							{/each}
						{/each}
					</div>
				{:else if tab === 'attempts'}
					<table class="table">
						<thead
							><tr
								><th>Blueprint</th><th>Test</th><th class="num">#</th><th>Stage</th><th>Checks</th
								><th>Score</th><th class="num">Latency</th><th class="num">t/s</th><th class="num"
									>Tokens</th
								></tr
							></thead
						>
						<tbody>
							{#each attempts as a (a.id)}
								<tr class="clickable" onclick={() => openAttempt(a)}>
									<td class="ellipsis" style="max-width:200px">{a.blueprint_label}</td>
									<td>{a.test_id}</td>
									<td class="num">{a.rep}</td>
									<td><Status status={a.error ? 'failed' : a.stage} /></td>
									<td><Status status={a.status} /></td>
									<td><Score value={a.score} gate={a.gate_failed} width={60} /></td>
									<td class="num">{fmtDuration(a.latency_ms)}</td>
									<td class="num">{fmtNum(a.gen_tps)}</td>
									<td class="num">{fmtNum(a.completion_tokens, 0)}</td>
								</tr>
								{#if a.error}<tr><td colspan="9" class="err small">{a.error}</td></tr>{/if}
							{/each}
						</tbody>
					</table>
				{:else if tab === 'llama' && run.llama}
					<div class="pad col">
						<div class="kv">
							<span>mode</span><b>{run.llama.mode}</b>
							<span>binary</span><b class="mono">{run.llama.binary}</b>
							<span>build</span><b class="mono">{run.llama.build ?? '—'}</b>
							<span>endpoint</span><b class="mono">{run.llama.connect_url}</b>
							<span>GPU</span><b>{run.llama.gpu?.join(', ') || '—'}</b>
						</div>
						{#each Object.entries(run.llama.sections) as [bp, section] (bp)}
							<div class="card">
								<h4 class="section-title">[{bp}]</h4>
								<div class="kv">
									{#each Object.entries(section) as [k, v] (k)}<span class="mono">{k}</span><b
											class="mono">{v}</b
										>{/each}
								</div>
								{#if run.llama.props[bp]}
									<details>
										<summary class="muted">/props and router status</summary><JsonTree
											value={run.llama.props[bp]}
										/>
									</details>
								{/if}
							</div>
						{/each}
						{#if llamaLog}
							<h4 class="section-title">llama-server.log</h4>
							<Code
								code={llamaLog.split('\n').slice(-400).join('\n')}
								lang="ini"
								maxHeight="420px"
							/>
						{/if}
					</div>
				{:else if tab === 'log'}
					<div class="pad col">
						{#if row.status === 'running' && liveLog.length}
							<div class="live-log mono">
								{#each liveLog.slice(-200) as l, i (i)}
									<div class="ll {l.level}">
										<span class="muted">{l.at.slice(11, 19)}</span>
										{l.message}
									</div>
								{/each}
							</div>
						{/if}
						<Code code={runLog || '(empty)'} lang={null} lineNumbers={false} wrap />
					</div>
				{:else if tab === 'spec'}
					<div class="pad col">
						<JsonTree
							value={{
								spec: run.spec,
								judge: run.judge,
								host: run.host,
								legacy: run.legacy ?? null
							}}
							open
						/>
						<h4 class="section-title">Blueprint snapshots</h4>
						<JsonTree value={run.blueprints} />
						<h4 class="section-title">Test snapshots</h4>
						<JsonTree
							value={Object.fromEntries(
								Object.entries(run.tests).map(([k, v]) => [
									k,
									{
										task_hash: v.task_hash,
										rubric_hash: v.rubric_hash,
										checks_hash: v.checks_hash,
										test: v.test
									}
								])
							)}
						/>
					</div>
				{/if}
			</div>
		{/if}
	{/snippet}
</Split>

<style>
	.side-head {
		position: sticky;
		top: 0;
		z-index: 2;
		display: flex;
		gap: var(--sp-3);
		padding: var(--sp-5);
		background: var(--surface);
		border-bottom: var(--bw) solid var(--line-soft);
	}
	.meta {
		font-size: var(--fs-s);
		color: var(--fg-3);
		gap: var(--sp-3);
	}
	.mean {
		font-variant-numeric: tabular-nums;
	}
	.mini {
		height: 3px;
		background: var(--sunken);
		overflow: hidden;
		margin-top: var(--sp-2);
	}
	.mini span {
		display: block;
		height: 100%;
		background: var(--data);
		transition: width var(--dur-2);
	}
	.head {
		display: flex;
		gap: var(--sp-6);
		padding: var(--sp-6) var(--sp-6) var(--sp-5);
		align-items: flex-start;
	}
	h2 {
		margin: 0;
		font-size: var(--fs-xl);
	}
	.note {
		margin: var(--sp-3) 0 0;
		font-size: var(--fs-m);
		color: var(--fg-2);
	}
	.err {
		color: var(--bad);
		font-size: var(--fs-m);
		white-space: pre-wrap;
		margin: var(--sp-3) 0 0;
	}
	.small {
		font-size: var(--fs-s);
	}
	.stats {
		display: flex;
		gap: var(--sp-6);
	}
	.stats div {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
	}
	.stats b {
		font-size: var(--fs-xl);
		font-variant-numeric: tabular-nums;
	}
	.stats b.bad {
		color: var(--bad);
	}
	.stats span {
		font-size: var(--fs-xs);
		color: var(--fg-3);
	}
	.actions {
		display: flex;
		gap: var(--sp-4);
		flex-wrap: wrap;
		padding: 0 var(--sp-6) var(--sp-5);
	}
	.tab-body {
		flex: 1;
	}
	.matrix {
		display: grid;
		grid-template-columns: minmax(170px, 240px) repeat(var(--cols), minmax(92px, 1fr));
		gap: var(--sp-2);
		padding: var(--sp-6);
	}
	.th {
		font-size: var(--fs-xs);
		color: var(--fg-3);
		text-align: center;
		padding: 0 var(--sp-1) var(--sp-3);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.rh {
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: var(--sp-2);
		padding-right: var(--sp-4);
		min-width: 0;
		font-size: var(--fs-m);
	}
	.cell {
		display: flex;
		gap: var(--sp-2);
		min-height: 40px;
		padding: var(--sp-2);
		background: var(--sunken);
		border: var(--bw) solid var(--line-soft);
	}
	.rep {
		position: relative;
		flex: 1;
		min-width: 0;
		display: grid;
		place-items: center;
		border: var(--bw) solid var(--line);
		background: var(--surface-2);
		color: var(--fg-3);
		font-size: var(--fs-xs);
		cursor: pointer;
		overflow: hidden;
		transition: border-color var(--dur-1);
	}
	.rep:hover {
		border-color: var(--fg);
	}
	.rep b {
		color: var(--fg);
		font-size: var(--fs-m);
		font-variant-numeric: tabular-nums;
	}
	.rep.st-judged {
		background: color-mix(in srgb, var(--c) 22%, transparent);
		border-color: color-mix(in srgb, var(--c) 45%, transparent);
	}
	.rep.st-failed {
		border-color: var(--bad);
		color: var(--bad);
	}
	.rep.st-generating,
	.rep.st-checking,
	.rep.st-judging {
		border-color: var(--fg-3);
		color: var(--fg);
		animation: blink 1s steps(2) infinite;
	}
	.live {
		font-size: var(--fs-xs);
	}
	.gate {
		position: absolute;
		top: 3px;
		right: 3px;
		width: 6px;
		height: 6px;
		background: var(--bad);
	}
	.kv {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: var(--sp-2) var(--sp-6);
		font-size: var(--fs-m);
	}
	.kv span {
		color: var(--fg-3);
	}
	.kv b {
		font-weight: var(--fw);
		color: var(--fg);
		word-break: break-all;
	}
	.live-log {
		font-size: var(--fs-s);
		background: var(--sunken);
		padding: var(--sp-5) var(--sp-5);
		max-height: 260px;
		overflow: auto;
		border: var(--bw) solid var(--line-strong);
	}
	.ll.warn {
		color: var(--warn);
	}
	.ll.error {
		color: var(--bad);
	}
	details summary {
		cursor: pointer;
		margin: var(--sp-4) 0 var(--sp-2);
		font-size: var(--fs-s);
	}
</style>
