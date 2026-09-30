<script lang="ts">
	import { leaderboard, type LeaderRow, type ScoreSource } from '$engine/core/rows.ts';
	import type { Win } from '../os/wm.svelte.ts';
	import { wm } from '../os/wm.svelte.ts';
	import { benchy } from '../data/store.svelte.ts';
	import Toolbar from '../ui/Toolbar.svelte';
	import Segmented from '../ui/Segmented.svelte';
	import Toggle from '../ui/Toggle.svelte';
	import Score from '../ui/Score.svelte';
	import Kind from '../ui/Kind.svelte';
	import Empty from '../ui/Empty.svelte';
	import { fmtCost, fmtDuration, fmtNum } from '../ui/format.ts';
	import { scoreColor } from '../design/score.ts';

	let { win: _win }: { win: Win } = $props();

	let view = $state('ranking');
	let source = $state<ScoreSource>('judge');
	let split = $state(false);
	let suite = $state('');
	let run = $state('');
	let hover = $state<{ row: LeaderRow; test: string; x: number; y: number } | null>(null);
	let hoverPoint = $state<LeaderRow | null>(null);
	/** Row highlighted in the matrix after picking an entry in ranking or scatter. */
	let focusKey = $state<string | null>(null);

	function showInMatrix(row: LeaderRow) {
		focusKey = row.key;
		view = 'matrix';
		requestAnimationFrame(() =>
			document
				.querySelector(`[data-row-key="${CSS.escape(row.key)}"]`)
				?.scrollIntoView({ block: 'nearest' })
		);
	}

	const suites = $derived(benchy.library?.suites ?? []);
	const board = $derived(
		leaderboard(benchy.attempts, {
			tests: suite ? suites.find((s) => s.id === suite)?.tests : undefined,
			runs: run ? [run] : undefined,
			splitVersions: split,
			source
		})
	);
	const scored = $derived(board.rows.filter((r) => r.overall.mean !== null));

	function openCell(row: LeaderRow, test: string) {
		const candidates = benchy.attempts
			.filter(
				(a) =>
					a.blueprint_id === row.blueprint_id &&
					a.test_id === test &&
					(!split || a.blueprint_hash === row.blueprint_hash) &&
					(!run || a.run_id === run)
			)
			.sort(
				(a, b) => (b.score ?? -1) - (a.score ?? -1) || b.created_at.localeCompare(a.created_at)
			);
		const best = candidates[0];
		if (best) wm.open('attempt', { key: best.id, id: best.id });
	}

	// ---- scatter geometry
	const W = 720;
	const H = 380;
	const P = { l: 52, r: 24, t: 20, b: 44 };
	const points = $derived(scored.filter((r) => r.mean_gen_tps !== null));
	const maxTps = $derived(Math.max(10, ...points.map((p) => p.mean_gen_tps ?? 0)) * 1.1);
	const sx = (v: number) => P.l + (v / maxTps) * (W - P.l - P.r);
	const sy = (v: number) => H - P.b - (v / 100) * (H - P.t - P.b);
	const ticksX = $derived(Array.from({ length: 6 }, (_, i) => Math.round((maxTps / 5) * i)));
</script>

<Toolbar>
	<Segmented
		options={[
			{ id: 'ranking', label: 'Ranking' },
			{ id: 'matrix', label: 'Matrix' },
			{ id: 'scatter', label: 'Score × speed' }
		]}
		bind:value={view}
	/>
	<span class="spacer"></span>
	<select class="select sm" bind:value={suite} title="Tests">
		<option value="">All tests</option>
		{#each suites as s (s.id)}<option value={s.id}>{s.title}</option>{/each}
	</select>
	<select class="select sm" bind:value={run} title="Run">
		<option value="">All runs</option>
		{#each benchy.runs as r (r.id)}<option value={r.id}>{r.label ?? r.id}</option>{/each}
	</select>
	<Segmented
		options={[
			{ id: 'judge', label: 'Judge' },
			{ id: 'human', label: 'Human' },
			{ id: 'blend', label: 'Blend' }
		]}
		bind:value={source}
	/>
	<Toggle bind:checked={split} label="Split versions" />
</Toolbar>

<div class="body scroll">
	{#if !board.rows.length}
		<Empty icon="trophy" title="Nothing to rank yet"
			>Run some blueprints against tests, or judge imported results.</Empty
		>
	{:else if view === 'ranking'}
		<table class="table">
			<thead>
				<tr>
					<th class="num">#</th>
					<th>Blueprint</th>
					<th>Score</th>
					<th class="num">Coverage</th>
					<th class="num">Attempts</th>
					<th class="num">Gates</th>
					<th class="num">t/s</th>
					<th class="num">Latency</th>
					<th class="num">Cost</th>
				</tr>
			</thead>
			<tbody>
				{#each board.rows as r, i (r.key)}
					<tr class="clickable" onclick={() => showInMatrix(r)}>
						<td class="num rank"
							>{#if r.overall.mean !== null}<span class:top={i === 0}>{i + 1}</span>{/if}</td
						>
						<td>
							<div class="row">
								<b class="ellipsis bp">{r.label}</b>
								<Kind kind={r.kind} />
								{#if r.blueprint_hash}<span class="mono hash">{r.blueprint_hash.slice(0, 7)}</span
									>{/if}
							</div>
						</td>
						<td
							><Score
								value={r.overall.mean}
								stddev={r.overall.n > 1 ? r.overall.stddev : null}
								width={120}
							/></td
						>
						<td class="num">{Math.round(r.coverage * 100)}%</td>
						<td class="num">{r.attempts}</td>
						<td class="num" class:bad={r.gates_failed > 0}>{r.gates_failed || ''}</td>
						<td class="num">{fmtNum(r.mean_gen_tps)}</td>
						<td class="num"
							>{fmtDuration(r.mean_latency_ms ? Math.round(r.mean_latency_ms) : null)}</td
						>
						<td class="num">{fmtCost(r.total_cost_usd)}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{:else if view === 'matrix'}
		<div class="matrix" style="--cols:{board.tests.length}">
			<div class="corner"></div>
			{#each board.tests as t (t)}
				<div class="col-head" title={benchy.testTitle(t)}><span>{t}</span></div>
			{/each}
			<div class="col-head overall"><span>overall</span></div>
			{#each board.rows as r (r.key)}
				<div class="row-head" class:focus={focusKey === r.key} data-row-key={r.key}>
					<span class="ellipsis">{r.label}</span>{#if r.blueprint_hash}<small class="mono"
							>{r.blueprint_hash.slice(0, 7)}</small
						>{/if}
				</div>
				{#each board.tests as t (t)}
					{@const cell = r.per_test[t]}
					{#if cell && cell.mean !== null}
						<button
							class="cell"
							style="--c:{scoreColor(cell.mean)}"
							onclick={() => openCell(r, t)}
							onmouseenter={(e) => (hover = { row: r, test: t, x: e.clientX, y: e.clientY })}
							onmouseleave={() => (hover = null)}
						>
							{cell.mean.toFixed(0)}
							{#if cell.gates_failed}<i class="gate"></i>{/if}
						</button>
					{:else if cell}
						<button class="cell pending" onclick={() => openCell(r, t)} title="not judged">
							{Object.keys(cell.statuses)[0] ?? '·'}
						</button>
					{:else}
						<div class="cell empty"></div>
					{/if}
				{/each}
				<div
					class="cell overall"
					class:none={r.overall.mean === null}
					style="--c:{scoreColor(r.overall.mean)}"
				>
					{r.overall.mean?.toFixed(1) ?? '—'}
				</div>
			{/each}
		</div>
		{#if hover}
			{@const c = hover.row.per_test[hover.test]}
			<div class="tip" style="left:{hover.x + 14}px; top:{hover.y + 14}px">
				<b>{hover.row.label}</b> × {benchy.testTitle(hover.test)}<br />
				mean <b>{c.mean}</b>{#if c.n > 1}
					± {c.stddev} (n={c.n}, {c.min}–{c.max}){/if}<br />
				<span class="muted"
					>{Object.entries(c.statuses)
						.map(([k, v]) => `${v} ${k}`)
						.join(' · ')}{c.gates_failed ? ` · ${c.gates_failed} gate failed` : ''}</span
				>
			</div>
		{/if}
	{:else}
		<div class="scatter card">
			{#if !points.length}
				<Empty icon="bolt" title="No speed data"
					>Generation speed comes from llama.cpp timings or the provider's usage data.</Empty
				>
			{:else}
				<svg viewBox="0 0 {W} {H}" role="img" aria-label="Score versus generation speed">
					{#each [0, 25, 50, 75, 100] as v (v)}
						<line x1={P.l} x2={W - P.r} y1={sy(v)} y2={sy(v)} class="gridline" />
						<text x={P.l - 10} y={sy(v) + 4} class="tick" text-anchor="end">{v}</text>
					{/each}
					{#each ticksX as v (v)}
						<text x={sx(v)} y={H - P.b + 18} class="tick" text-anchor="middle">{v}</text>
					{/each}
					<text x={(W + P.l) / 2} y={H - 6} class="axis" text-anchor="middle"
						>generation speed (tokens/s)</text
					>
					<text
						x={14}
						y={(H - P.b) / 2}
						class="axis"
						text-anchor="middle"
						transform="rotate(-90 14 {(H - P.b) / 2})">score</text
					>
					{#each points as p (p.key)}
						<g
							class="pt"
							class:dim={hoverPoint && hoverPoint.key !== p.key}
							role="presentation"
							onmouseenter={() => (hoverPoint = p)}
							onmouseleave={() => (hoverPoint = null)}
							onclick={() => showInMatrix(p)}
						>
							<rect
								x={sx(p.mean_gen_tps ?? 0) - 4}
								y={sy(p.overall.mean ?? 0) - 4}
								width="8"
								height="8"
								style="--c:{scoreColor(p.overall.mean)}"
							/>
							<text x={sx(p.mean_gen_tps ?? 0) + 11} y={sy(p.overall.mean ?? 0) + 4} class="lbl"
								>{p.label}</text
							>
						</g>
					{/each}
				</svg>
				{#if hoverPoint}
					<p class="muted legend">
						<b>{hoverPoint.label}</b> — score {hoverPoint.overall.mean}, {fmtNum(
							hoverPoint.mean_gen_tps
						)} t/s, {hoverPoint.attempts} attempts
					</p>
				{:else}
					<p class="muted legend">
						Top-right is best: high score at high speed. Click a point to open its blueprint.
					</p>
				{/if}
			{/if}
		</div>
	{/if}
</div>

<style>
	.select.sm {
		width: auto;
		max-width: 220px;
	}
	.body {
		flex: 1;
		padding-bottom: var(--sp-4);
	}
	.bp {
		max-width: 320px;
		color: var(--fg);
	}
	.hash {
		font-size: var(--fs-xs);
		color: var(--fg-4);
	}
	.rank {
		width: 4ch;
		color: var(--fg-3);
	}
	.rank .top {
		color: var(--fg);
		font-weight: var(--fw-strong);
	}
	.bad {
		color: var(--bad);
		font-weight: var(--fw-strong);
	}

	.matrix {
		display: grid;
		grid-template-columns: minmax(170px, 240px) repeat(var(--cols), minmax(44px, 1fr)) 64px;
		gap: var(--sp-1);
		padding: var(--sp-5);
	}
	.corner,
	.col-head {
		height: 104px;
	}
	.col-head {
		display: flex;
		align-items: flex-end;
		justify-content: center;
		padding-bottom: var(--sp-2);
	}
	.col-head span {
		writing-mode: vertical-rl;
		transform: rotate(180deg);
		max-height: 100px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: var(--fs-s);
		color: var(--fg-3);
	}
	.col-head.overall span {
		color: var(--fg);
		font-weight: var(--fw-strong);
	}
	.row-head {
		display: flex;
		flex-direction: column;
		justify-content: center;
		min-width: 0;
		padding: 0 var(--sp-4);
		color: var(--fg);
	}
	.row-head.focus {
		box-shadow: inset 2px 0 0 var(--accent);
		background: var(--accent-soft);
	}
	.row-head small {
		font-size: var(--fs-xs);
		color: var(--fg-4);
	}
	/* heatmap cell: score-scale tint, number always printed */
	.cell {
		position: relative;
		display: grid;
		place-items: center;
		height: var(--row-h);
		border: var(--bw) solid color-mix(in srgb, var(--c, var(--line)) 45%, transparent);
		background: color-mix(in srgb, var(--c, transparent) 22%, transparent);
		color: var(--fg);
		font-weight: var(--fw-strong);
		font-variant-numeric: tabular-nums;
		cursor: pointer;
		transition: border-color var(--dur-1);
	}
	.cell:hover {
		border-color: var(--fg);
	}
	.cell.pending {
		border-color: var(--line);
		background: var(--surface-2);
		color: var(--fg-3);
		font-size: var(--fs-xs);
		font-weight: var(--fw);
	}
	.cell.empty {
		border: var(--bw) dashed var(--line-soft);
		background: transparent;
		cursor: default;
	}
	.cell.overall {
		border-color: var(--line-strong);
		background: var(--surface);
		color: var(--c);
		cursor: default;
	}
	.cell.overall.none {
		color: var(--fg-4);
	}
	.gate {
		position: absolute;
		top: 2px;
		right: 2px;
		width: 4px;
		height: 4px;
		background: var(--bad);
	}
	.tip {
		position: fixed;
		z-index: 30000;
		max-width: 320px;
		padding: var(--sp-3) var(--sp-4);
		background: var(--surface);
		border: var(--bw) solid var(--line-strong);
		box-shadow: var(--shadow-pop);
		font-size: var(--fs-s);
		pointer-events: none;
	}
	.scatter {
		margin: var(--sp-5);
	}
	svg {
		width: 100%;
		height: auto;
		display: block;
	}
	.gridline {
		stroke: var(--line-soft);
		stroke-dasharray: 2 4;
	}
	.tick {
		fill: var(--fg-4);
		font-size: var(--fs-s);
		font-family: var(--font);
	}
	.axis {
		fill: var(--fg-3);
		font-size: var(--fs-s);
		font-family: var(--font);
	}
	.pt rect {
		fill: var(--c);
		stroke: var(--surface);
		stroke-width: 1;
		cursor: pointer;
	}
	.pt.dim {
		opacity: 0.25;
	}
	.lbl {
		fill: var(--fg-2);
		font-size: var(--fs-s);
		font-family: var(--font);
	}
	.legend {
		margin: var(--sp-3) var(--sp-2) 0;
		font-size: var(--fs-s);
	}
</style>
