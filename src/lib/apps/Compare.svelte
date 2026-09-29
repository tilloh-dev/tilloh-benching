<script lang="ts">
	import type { AttemptDetail } from '$engine/api-types.ts';
	import type { Win } from '../os/wm.svelte.ts';
	import { benchy } from '../data/store.svelte.ts';
	import ArtifactPreview from '../viewers/ArtifactPreview.svelte';
	import Score from '../ui/Score.svelte';
	import Empty from '../ui/Empty.svelte';
	import Spinner from '../ui/Spinner.svelte';

	let { win: _win, props }: { win: Win; props: Record<string, unknown> } = $props();

	let test = $state('');
	let left = $state('');
	let right = $state('');
	let dl = $state<AttemptDetail | null>(null);
	let dr = $state<AttemptDetail | null>(null);

	$effect(() => {
		const l = props.left as string | undefined;
		if (l) {
			left = l;
			test = benchy.attempts.find((a) => a.id === l)?.test_id ?? test;
		}
	});

	const tests = $derived([...new Set(benchy.attempts.map((a) => a.test_id))].sort());
	const options = $derived(
		benchy.attempts
			.filter((a) => a.test_id === test && !a.error)
			.sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
	);
	$effect(() => {
		if (!test && tests.length) test = tests[0];
	});
	$effect(() => {
		if (options.length && !options.some((o) => o.id === left)) left = options[0]?.id ?? '';
		if (options.length && (!right || !options.some((o) => o.id === right) || right === left))
			right = options.find((o) => o.id !== left)?.id ?? '';
	});
	$effect(() => {
		dl = null;
		if (left) benchy.api.attempt(left).then((d) => (dl = d));
	});
	$effect(() => {
		dr = null;
		if (right) benchy.api.attempt(right).then((d) => (dr = d));
	});

	function label(a: (typeof options)[number]) {
		return `${a.blueprint_label}${a.rep > 1 ? ` #${a.rep}` : ''} — ${a.score?.toFixed(1) ?? a.status ?? '?'}`;
	}
</script>

<div class="bar">
	<select class="select" bind:value={test} style="max-width:260px"
		>{#each tests as t (t)}<option value={t}>{benchy.testTitle(t)}</option>{/each}</select
	>
	<span class="vs">A</span>
	<select class="select" bind:value={left}
		>{#each options as o (o.id)}<option value={o.id}>{label(o)}</option>{/each}</select
	>
	<span class="vs">B</span>
	<select class="select" bind:value={right}
		>{#each options as o (o.id)}<option value={o.id}>{label(o)}</option>{/each}</select
	>
</div>
{#if options.length < 2}
	<Empty icon="compare" title="Need two attempts of the same test" />
{:else}
	<div class="sides">
		{#each [dl, dr] as d, i (i)}
			<div class="side">
				{#if !d}
					<Spinner />
				{:else}
					<div class="side-head">
						<b class="ellipsis grow">{d.row.blueprint_label}</b>
						<Score value={d.row.score} gate={d.row.gate_failed} width={80} />
					</div>
					<div class="prev">
						{#if d.attempt.artifacts[0]}<ArtifactPreview
								detail={d}
								artifact={d.attempt.artifacts[0]}
							/>{:else}<Empty icon="file" title="No artifact" />{/if}
					</div>
				{/if}
			</div>
		{/each}
	</div>
	{#if dl?.judgements[0]?.verdict && dr?.judgements[0]?.verdict}
		<div class="crit scroll">
			<table class="table">
				<thead><tr><th>Criterion</th><th>A</th><th>B</th></tr></thead>
				<tbody>
					{#each dl.judgements[0].criteria as c (c.id)}
						{@const a = dl.judgements[0].verdict.criteria.find((x) => x.id === c.id)?.score}
						{@const b = dr.judgements[0].verdict.criteria.find((x) => x.id === c.id)?.score}
						<tr>
							<td>{c.title} <span class="muted">×{c.weight}</span></td>
							<td class:win={(a ?? 0) > (b ?? 0)}
								><Score value={a != null ? a * 10 : null} width={70} /></td
							>
							<td class:win={(b ?? 0) > (a ?? 0)}
								><Score value={b != null ? b * 10 : null} width={70} /></td
							>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
{/if}

<style>
	.bar {
		display: flex;
		gap: 8px;
		align-items: center;
		padding: 10px 12px;
		border-bottom: 1px solid var(--line-soft);
	}
	.vs {
		display: grid;
		place-items: center;
		width: 22px;
		height: 22px;
		border-radius: 50%;
		background: var(--yellow);
		color: var(--yellow-ink);
		font-weight: 700;
		font-size: 11px;
		flex: none;
	}
	.sides {
		flex: 1;
		min-height: 0;
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px;
		padding: 10px;
	}
	.side {
		display: flex;
		flex-direction: column;
		min-height: 0;
		gap: 8px;
	}
	.side-head {
		display: flex;
		gap: 10px;
		align-items: center;
	}
	.prev {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}
	.crit {
		max-height: 34%;
		border-top: 1px solid var(--line-soft);
	}
	td.win {
		background: var(--yellow-a10);
	}
</style>
