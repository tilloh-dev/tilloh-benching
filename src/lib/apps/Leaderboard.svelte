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
	import { fmtCost, fmtDuration, fmtNum, scoreHue } from '../ui/format.ts';

	let { win: _win }: { win: Win } = $props();

	let view = $state('ranking');
	let source = $state<ScoreSource>('judge');
	let split = $state(false);
	let suite = $state('');
	let run = $state('');
	let hover = $state<{ row: LeaderRow; test: string; x: number; y: number } | null>(null);
	let hoverPoint = $state<LeaderRow | null>(null);

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
					<tr
						class="clickable"
						style="animation-delay:{Math.min(i, 20) * 25}ms"
						onclick={() => wm.open('blueprints', { select: r.blueprint_id })}
					>
						<td class="num rank"
							>{#if r.overall.mean !== null}{#if i < 3}<span class="medal m{i}">{i + 1}</span
									>{:else}{i + 1}{/if}{/if}</td
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
			{#each board.rows as r, ri (r.key)}
				<div class="row-head">
					<span class="ellipsis">{r.label}</span>{#if r.blueprint_hash}<small class="mono"
							>{r.blueprint_hash.slice(0, 7)}</small
						>{/if}
				</div>
				{#each board.tests as t, ti (t)}
					{@const cell = r.per_test[t]}
					{#if cell && cell.mean !== null}
						<button
							class="cell"
							style="--h:{scoreHue(cell.mean)}; --a:{0.25 +
								(cell.mean / 100) * 0.6}; animation-delay:{(ri * board.tests.length + ti) * 8}ms"
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
					style="--h:{scoreHue(r.overall.mean ?? 0)}"
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
							onclick={() => wm.open('blueprints', { select: p.blueprint_id })}
						>
							<circle
								cx={sx(p.mean_gen_tps ?? 0)}
								cy={sy(p.overall.mean ?? 0)}
								r="7"
								style="--h:{scoreHue(p.overall.mean ?? 0)}"
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
		height: 30px;
		padding-top: 4px;
		padding-bottom: 4px;
		font-size: 12.5px;
		max-width: 220px;
	}
	.body {
		flex: 1;
		padding: 0 0 12px;
	}
	tbody tr {
		animation: fade-up 0.3s both;
	}
	.bp {
		max-width: 320px;
		color: var(--text);
	}
	.hash {
		font-size: 11px;
		color: var(--text-4);
	}
	.rank {
		width: 44px;
		color: var(--text-3);
	}
	.medal {
		display: inline-grid;
		place-items: center;
		width: 24px;
		height: 24px;
		border-radius: 50%;
		font-weight: 700;
		font-size: 12px;
		color: var(--yellow-ink);
	}
	.m0 {
		background: radial-gradient(circle at 35% 30%, #fff3b0, #ffd23f 55%, #c99b0a);
		box-shadow: 0 0 14px rgba(255, 210, 63, 0.6);
	}
	.m1 {
		background: radial-gradient(circle at 35% 30%, #ffffff, #c9d2ec 55%, #8f9bbf);
	}
	.m2 {
		background: radial-gradient(circle at 35% 30%, #ffd9b8, #d9894a 55%, #9c5a26);
	}
	.bad {
		color: var(--bad);
		font-weight: 600;
	}

	.matrix {
		display: grid;
		grid-template-columns: minmax(180px, 260px) repeat(var(--cols), minmax(54px, 1fr)) 76px;
		gap: 3px;
		padding: 14px;
		align-items: stretch;
	}
	.corner {
		height: 110px;
	}
	.col-head {
		height: 110px;
		display: flex;
		align-items: flex-end;
		justify-content: center;
		padding-bottom: 4px;
	}
	.col-head span {
		writing-mode: vertical-rl;
		transform: rotate(180deg);
		font-size: 11.5px;
		color: var(--text-3);
		white-space: nowrap;
		max-height: 104px;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.col-head.overall span {
		color: var(--yellow-2);
		font-weight: 600;
	}
	.row-head {
		display: flex;
		flex-direction: column;
		justify-content: center;
		padding: 0 8px;
		font-size: 12.5px;
		color: var(--text);
		min-width: 0;
	}
	.row-head small {
		font-size: 10px;
		color: var(--text-4);
	}
	.cell {
		position: relative;
		height: 38px;
		border-radius: 7px;
		border: 1px solid hsl(var(--h, 230) 70% 55% / 0.35);
		background: hsl(var(--h, 230) 75% 45% / var(--a, 0.2));
		color: #fff;
		font-weight: 600;
		font-size: 12.5px;
		font-variant-numeric: tabular-nums;
		display: grid;
		place-items: center;
		cursor: pointer;
		animation: fade-up 0.3s both;
		transition:
			transform 0.12s,
			box-shadow 0.15s;
		text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
	}
	.cell:hover {
		transform: scale(1.08);
		z-index: 2;
		box-shadow:
			0 0 0 2px var(--yellow),
			0 0 16px rgba(255, 210, 63, 0.4);
	}
	.cell.pending {
		background: var(--bg-3);
		border-color: var(--line-soft);
		color: var(--text-3);
		font-size: 10.5px;
		font-weight: 500;
	}
	.cell.empty {
		background: transparent;
		border: 1px dashed var(--line-soft);
		cursor: default;
		animation: none;
	}
	.cell.overall {
		background: hsl(var(--h) 75% 45% / 0.18);
		border: 1px solid var(--yellow-a35);
		color: hsl(var(--h) 90% 75%);
		cursor: default;
	}
	.cell.overall.none {
		background: var(--bg-3);
		border-color: var(--line-soft);
		color: var(--text-4);
	}
	.cell.overall:hover {
		transform: none;
		box-shadow: none;
	}
	.gate {
		position: absolute;
		top: 4px;
		right: 4px;
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--bad);
		box-shadow: 0 0 6px var(--bad);
	}
	.tip {
		position: fixed;
		z-index: 30000;
		padding: 8px 11px;
		border-radius: 8px;
		background: rgba(14, 22, 52, 0.97);
		border: 1px solid var(--line-strong);
		box-shadow: var(--shadow-pop);
		font-size: 12px;
		line-height: 1.55;
		pointer-events: none;
		max-width: 320px;
	}
	.scatter {
		margin: 14px;
	}
	svg {
		width: 100%;
		height: auto;
		display: block;
	}
	.gridline {
		stroke: var(--line-soft);
		stroke-dasharray: 3 4;
	}
	.tick {
		fill: var(--text-4);
		font-size: 11px;
	}
	.axis {
		fill: var(--text-3);
		font-size: 11.5px;
	}
	.pt circle {
		fill: hsl(var(--h) 85% 55%);
		stroke: #fff;
		stroke-width: 1.5;
		filter: drop-shadow(0 0 6px hsl(var(--h) 90% 55% / 0.8));
		cursor: pointer;
		transition: r 0.15s;
	}
	.pt:hover circle {
		r: 10;
	}
	.pt.dim {
		opacity: 0.25;
	}
	.lbl {
		fill: var(--text-2);
		font-size: 11.5px;
	}
	.legend {
		margin: 6px 4px 0;
		font-size: 12px;
	}
</style>
