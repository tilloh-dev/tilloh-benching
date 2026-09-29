<script lang="ts">
	import type { Win } from '../os/wm.svelte.ts';
	import { wm } from '../os/wm.svelte.ts';
	import { benchy } from '../data/store.svelte.ts';
	import { toasts } from '../os/toasts.svelte.ts';
	import Button from '../ui/Button.svelte';
	import Tabs from '../ui/Tabs.svelte';
	import Score from '../ui/Score.svelte';
	import Empty from '../ui/Empty.svelte';
	import Status from '../ui/Status.svelte';

	let { win: _win }: { win: Win } = $props();

	let tab = $state('queue');
	let model = $state('');
	let effort = $state('');
	let mode = $state('');
	let busy = $state(false);

	const unjudged = $derived(
		benchy.attempts.filter(
			(a) => a.score === null && !a.error && (a.stage === 'checked' || a.stage === 'judged')
		)
	);
	const judging = $derived(benchy.attempts.filter((a) => a.stage === 'judging'));
	const byRun = $derived.by(() => {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- local to a $derived computation
		const m = new Map<string, typeof unjudged>();
		for (const a of unjudged) m.set(a.run_id, [...(m.get(a.run_id) ?? []), a]);
		return [...m.entries()];
	});
	const pairs = $derived(
		benchy.attempts
			.filter((a) => a.score !== null && a.human_score !== null)
			.map((a) => ({ a, delta: (a.score ?? 0) - (a.human_score ?? 0) }))
			.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta))
	);
	const mae = $derived(
		pairs.length ? pairs.reduce((s, p) => s + Math.abs(p.delta), 0) / pairs.length : null
	);
	const bias = $derived(
		pairs.length ? pairs.reduce((s, p) => s + p.delta, 0) / pairs.length : null
	);
	const judgeLog = $derived(
		benchy.logs
			.filter((l) => /judge/i.test(l.message))
			.slice(-120)
			.reverse()
	);

	async function judge(ids: string[]) {
		busy = true;
		try {
			const override: Record<string, unknown> = {};
			if (model) override.model = model;
			if (effort) override.effort = effort;
			if (mode) override.mode_override = mode;
			const r = await benchy.api.judge(ids, override);
			toasts.push('info', `Queued ${r.queued} judgement(s)`);
		} catch (e) {
			toasts.error(e);
		} finally {
			busy = false;
		}
	}
</script>

<div class="head">
	<div class="stat">
		<b>{benchy.attempts.filter((a) => a.score !== null).length}</b><span>judged</span>
	</div>
	<div class="stat"><b>{unjudged.length}</b><span>waiting</span></div>
	<div class="stat">
		<b class:live={judging.length > 0}>{judging.length}</b><span>in progress</span>
	</div>
	<div class="stat"><b>{mae !== null ? mae.toFixed(1) : '—'}</b><span>judge ↔ human MAE</span></div>
	<span class="spacer"></span>
	<div class="cfg muted small">
		default judge: <b>{benchy.status?.settings?.judge.model ?? '—'}</b> @ {benchy.status?.settings
			?.judge.effort ?? '—'}
	</div>
</div>
<Tabs
	bind:active={tab}
	tabs={[
		{ id: 'queue', label: 'Unjudged', count: unjudged.length },
		{ id: 'calibration', label: 'Judge vs. human', count: pairs.length },
		{ id: 'log', label: 'Activity' }
	]}
/>
<div class="body scroll">
	{#if tab === 'queue'}
		{#if benchy.live}
			<div class="card opts">
				<div class="row wrap">
					<input
						class="input"
						style="max-width:220px"
						list="jm"
						placeholder="model (default)"
						bind:value={model}
					/>
					<datalist id="jm"
						><option value="claude-opus-5-5"></option><option value="claude-sonnet-5-5"
						></option><option value="haiku"></option></datalist
					>
					<select class="select" style="max-width:160px" bind:value={effort}
						><option value="">effort (default)</option
						>{#each ['low', 'medium', 'high', 'xhigh', 'max'] as e (e)}<option value={e}>{e}</option
							>{/each}</select
					>
					<select class="select" style="max-width:200px" bind:value={mode}
						><option value="">depth: per test</option><option value="static">force static</option
						><option value="interactive">force interactive</option></select
					>
					<span class="spacer"></span>
					<Button
						variant="primary"
						icon="gavel"
						loading={busy}
						disabled={!unjudged.length}
						onclick={() => judge(unjudged.map((a) => a.id))}>Judge all {unjudged.length}</Button
					>
				</div>
				<p class="hint">
					Judging runs in the background with limited parallelism (settings → concurrency.judge).
					Opus at xhigh takes a few minutes per attempt; watch your subscription limits on large
					batches.
				</p>
			</div>
		{/if}
		{#each byRun as [runId, list] (runId)}
			<div class="card">
				<div class="row">
					<b class="grow ellipsis">{benchy.runById(runId)?.label ?? runId}</b><span
						class="muted small">{list.length} waiting</span
					>{#if benchy.live}<Button
							size="sm"
							icon="gavel"
							onclick={() => judge(list.map((a) => a.id))}>Judge run</Button
						>{/if}
				</div>
				<div class="chips">
					{#each list.slice(0, 60) as a (a.id)}
						<button class="chip" onclick={() => wm.open('attempt', { key: a.id, id: a.id })}
							>{a.blueprint_label} × {a.test_id}{a.rep > 1 ? ` #${a.rep}` : ''}</button
						>
					{/each}
					{#if list.length > 60}<span class="muted small">… {list.length - 60} more</span>{/if}
				</div>
			</div>
		{:else}
			<Empty icon="gavel" title="Nothing waiting">Every generated attempt has a verdict.</Empty>
		{/each}
	{:else if tab === 'calibration'}
		{#if !pairs.length}
			<Empty icon="user" title="No human ratings yet"
				>Rate attempts yourself in the attempt viewer's Human tab. Differences between you and the
				judge show up here.</Empty
			>
		{:else}
			<p class="hint pad-x">
				Mean absolute difference <b>{mae?.toFixed(1)}</b> points; the judge is on average
				<b>{bias !== null ? `${bias > 0 ? '+' : ''}${bias.toFixed(1)}` : '—'}</b>
				{bias !== null && bias > 0 ? 'more generous' : 'stricter'} than you. Largest disagreements first.
			</p>
			<table class="table">
				<thead
					><tr><th>Attempt</th><th>Judge</th><th>Human</th><th class="num">Δ</th><th>Checks</th></tr
					></thead
				>
				<tbody>
					{#each pairs as p (p.a.id)}
						<tr class="clickable" onclick={() => wm.open('attempt', { key: p.a.id, id: p.a.id })}>
							<td class="ellipsis" style="max-width:320px">{p.a.blueprint_label} × {p.a.test_id}</td
							>
							<td><Score value={p.a.score} width={70} /></td>
							<td><Score value={p.a.human_score} width={70} /></td>
							<td class="num" class:pos={p.delta > 0} class:neg={p.delta < 0}
								>{p.delta > 0 ? '+' : ''}{p.delta.toFixed(1)}</td
							>
							<td><Status status={p.a.status} /></td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	{:else}
		<div class="log mono">
			{#each judgeLog as l, i (i)}
				<div class={l.level}><span class="muted">{l.at.slice(11, 19)}</span> {l.message}</div>
			{:else}
				<p class="muted">No judge activity in this session.</p>
			{/each}
		</div>
	{/if}
</div>

<style>
	.head {
		display: flex;
		align-items: center;
		gap: 22px;
		padding: 14px 16px;
		border-bottom: 1px solid var(--line-soft);
	}
	.stat {
		display: flex;
		flex-direction: column;
	}
	.stat b {
		font-size: 22px;
		font-variant-numeric: tabular-nums;
	}
	.stat b.live {
		color: var(--yellow);
		text-shadow: 0 0 12px var(--yellow-a35);
	}
	.stat span {
		font-size: 11px;
		color: var(--text-3);
	}
	.small {
		font-size: 12px;
	}
	.body {
		flex: 1;
		padding: 12px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.opts {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		margin-top: 8px;
	}
	.chip {
		font-size: 11.5px;
		padding: 3px 8px;
		border-radius: 999px;
		border: 1px solid var(--line-soft);
		background: var(--bg-1);
		color: var(--text-2);
		cursor: pointer;
	}
	.chip:hover {
		border-color: var(--yellow-a35);
		color: var(--text);
	}
	.pad-x {
		padding: 0 4px;
	}
	.pos {
		color: var(--warn);
	}
	.neg {
		color: var(--info);
	}
	.log {
		font-size: 12px;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.log .warn {
		color: var(--warn);
	}
	.log .error {
		color: var(--bad);
	}
</style>
