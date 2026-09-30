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
	import JudgeProfiles from './JudgeProfiles.svelte';

	let { win: _win }: { win: Win } = $props();

	let tab = $state('queue');
	/** '' = default profile. The queue lists attempts this profile has not scored yet. */
	let profile = $state('');
	let mode = $state('');
	let busy = $state(false);

	const judges = $derived(benchy.library?.judges ?? []);
	const defaultJudge = $derived(judges.find((j) => j.default)?.profile);
	const profileId = $derived(profile || defaultJudge?.id || '');
	const unjudged = $derived(
		benchy.attempts.filter(
			(a) =>
				!a.error &&
				(a.stage === 'checked' || a.stage === 'judged') &&
				!a.judge_scores.some((j) => j.profile === profileId)
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
			.filter((a) => a.judge_score !== null && a.human_score !== null)
			.map((a) => ({ a, delta: (a.judge_score ?? 0) - (a.human_score ?? 0) }))
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
			const r = await benchy.api.judge(ids, {
				profile: profile || undefined,
				mode_override: (mode || undefined) as 'static' | 'interactive' | undefined
			});
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
		<b>{benchy.attempts.filter((a) => a.judge_score !== null).length}</b><span>judged</span>
	</div>
	<div class="stat"><b>{unjudged.length}</b><span>waiting</span></div>
	<div class="stat">
		<b class:live={judging.length > 0}>{judging.length}</b><span>in progress</span>
	</div>
	<div class="stat"><b>{mae !== null ? mae.toFixed(1) : '—'}</b><span>judge ↔ human MAE</span></div>
	<span class="spacer"></span>
	<div class="cfg muted small">
		default judge: <b>{defaultJudge?.label ?? defaultJudge?.id ?? '—'}</b>
	</div>
</div>
<Tabs
	bind:active={tab}
	tabs={[
		{ id: 'queue', label: 'Unjudged', count: unjudged.length },
		{ id: 'profiles', label: 'Profiles', count: judges.length },
		{ id: 'calibration', label: 'Judge vs. human', count: pairs.length },
		{ id: 'log', label: 'Activity' }
	]}
/>
<div class="body scroll">
	{#if tab === 'queue'}
		{#if benchy.live}
			<div class="card opts">
				<div class="row wrap">
					<select
						class="select"
						style="max-width:260px"
						bind:value={profile}
						aria-label="Judge profile"
					>
						{#each judges as j (j.profile.id)}
							<option value={j.default ? '' : j.profile.id}
								>{j.profile.label ?? j.profile.id}{j.default ? ' — default' : ''}{j.key_set ===
								false
									? ' (key missing)'
									: ''}</option
							>
						{/each}
					</select>
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
					Lists attempts the chosen profile has not scored. Each profile adds one vote to the
					combined score. Judging runs in the background with limited parallelism (settings →
					concurrency.judge). Opus at xhigh takes a few minutes per attempt; watch your subscription
					limits on large batches.
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
			<Empty icon="gavel" title="Nothing waiting"
				>Every generated attempt has a verdict from this profile.</Empty
			>
		{/each}
	{:else if tab === 'profiles'}
		<div class="profiles"><JudgeProfiles /></div>
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
					><tr
						><th>Attempt</th><th>Judges (mean)</th><th>You</th><th class="num">Δ</th><th>Checks</th
						></tr
					></thead
				>
				<tbody>
					{#each pairs as p (p.a.id)}
						<tr class="clickable" onclick={() => wm.open('attempt', { key: p.a.id, id: p.a.id })}>
							<td class="ellipsis" style="max-width:320px">{p.a.blueprint_label} × {p.a.test_id}</td
							>
							<td><Score value={p.a.judge_score} width={70} /></td>
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
		gap: var(--sp-7);
		padding: var(--sp-6) var(--sp-6);
		border-bottom: var(--bw) solid var(--line-soft);
	}
	.stat {
		display: flex;
		flex-direction: column;
	}
	.stat b {
		font-size: var(--fs-xl);
		font-variant-numeric: tabular-nums;
	}
	.stat b.live {
		color: var(--fg);
		animation: blink 1s steps(2) infinite;
	}
	.stat span {
		font-size: var(--fs-xs);
		color: var(--fg-3);
	}
	.small {
		font-size: var(--fs-s);
	}
	.body {
		flex: 1;
		padding: var(--sp-5);
		display: flex;
		flex-direction: column;
		gap: var(--sp-5);
	}
	.profiles {
		flex: 1;
		min-height: 420px;
		display: flex;
		margin: calc(-1 * var(--sp-5));
	}
	.opts {
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
		margin-top: var(--sp-4);
	}
	.chip {
		font-size: var(--fs-s);
		padding: var(--sp-2) var(--sp-4);
		border: var(--bw) solid var(--line-soft);
		background: var(--sunken);
		color: var(--fg-2);
		cursor: pointer;
	}
	.chip:hover {
		color: var(--fg);
		border-color: var(--line-strong);
	}
	.pad-x {
		padding: 0 var(--sp-2);
	}
	.pos {
		color: var(--warn);
	}
	.neg {
		color: var(--info);
	}
	.log {
		font-size: var(--fs-s);
		display: flex;
		flex-direction: column;
		gap: var(--sp-1);
	}
	.log .warn {
		color: var(--warn);
	}
	.log .error {
		color: var(--bad);
	}
</style>
