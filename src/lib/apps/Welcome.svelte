<script lang="ts">
	import type { Win } from '../os/wm.svelte.ts';
	import { wm } from '../os/wm.svelte.ts';
	import { benchy } from '../data/store.svelte.ts';
	import Logo from '../os/Logo.svelte';
	import AppTile from '../os/AppTile.svelte';
	import Icon from '../os/Icon.svelte';

	let { win: _win }: { win: Win } = $props();

	const judged = $derived(benchy.attempts.filter((a) => a.score !== null).length);
	const blueprints = $derived(benchy.library?.blueprints.length ?? 0);
	const tests = $derived(benchy.library?.tests.length ?? 0);

	const steps = [
		{
			icon: 'blueprint',
			hue: 215,
			title: 'Blueprints',
			text: 'A model plus every knob that matters: llama.cpp flags, sampling, effort, system prompt. Versioned by hash.'
		},
		{
			icon: 'flask',
			hue: 150,
			title: 'Bench tests',
			text: 'A prompt, the files you expect back, automated checks and the criteria a judge scores.'
		},
		{
			icon: 'gavel',
			hue: 40,
			title: 'Independent judge',
			text: 'Claude Code (claude -p) inspects code, screenshots and logs — blind to the model — and scores each criterion.'
		}
	];
</script>

<div class="welcome scroll">
	<section class="hero">
		<div class="logo-wrap"><Logo size={64} /></div>
		<div>
			<h1>Welcome to <span>Benchy</span></h1>
			<p>
				Benchmark local and remote models against your own prompts. Every result is stored as files,
				checked automatically and scored by an independent Claude Code judge.
			</p>
			{#if !benchy.live}
				<p class="static">
					<Icon name="eye" size={14} /> You are looking at a read-only export. Everything shown here was
					produced by Benchy on <b>{benchy.status?.host.name}</b>.
				</p>
			{/if}
		</div>
	</section>

	<section class="stats">
		<div class="stat"><b>{benchy.runs.length}</b><span>runs</span></div>
		<div class="stat"><b>{benchy.attempts.length}</b><span>attempts</span></div>
		<div class="stat"><b>{judged}</b><span>judged</span></div>
		<div class="stat"><b>{blueprints}</b><span>blueprints</span></div>
		<div class="stat"><b>{tests}</b><span>tests</span></div>
	</section>

	<section class="steps">
		{#each steps as s, i (s.title)}
			<div class="step" style="animation-delay:{i * 80}ms">
				<AppTile icon={s.icon} hue={s.hue} size={44} />
				<div>
					<h3><span class="n">{i + 1}</span>{s.title}</h3>
					<p>{s.text}</p>
				</div>
			</div>
		{/each}
	</section>

	<section class="actions">
		<button class="action primary" onclick={() => wm.open('leaderboard')}
			><Icon name="trophy" size={20} /><span
				><b>Leaderboard</b><small>Who wins, on what, how fast</small></span
			></button
		>
		{#if benchy.live}
			<button class="action" onclick={() => wm.open('launcher')}
				><Icon name="play" size={20} /><span
					><b>New run</b><small>Blueprints × tests, with preflight</small></span
				></button
			>
		{/if}
		<button class="action" onclick={() => wm.open('runs')}
			><Icon name="rocket" size={20} /><span
				><b>Runs</b><small>Live progress, logs, results</small></span
			></button
		>
		<button class="action" onclick={() => wm.open('tests')}
			><Icon name="flask" size={20} /><span
				><b>Bench tests</b><small>Prompts and judge criteria</small></span
			></button
		>
	</section>

	<p class="keys muted">
		<kbd>Ctrl K</kbd> search everything · double-click desktop icons · drag windows to screen edges to
		snap
	</p>
</div>

<style>
	.welcome {
		padding: 22px 26px 18px;
		display: flex;
		flex-direction: column;
		gap: 20px;
		height: 100%;
		background:
			radial-gradient(80% 60% at 100% 0%, rgba(255, 210, 63, 0.08), transparent 60%), var(--bg-2);
	}
	.hero {
		display: flex;
		gap: 20px;
		align-items: center;
		animation: fade-up 0.4s both;
	}
	.logo-wrap {
		display: grid;
		place-items: center;
		width: 96px;
		height: 96px;
		flex: none;
		border-radius: 26px;
		background: radial-gradient(circle at 50% 40%, #1c2b66, #0c1433);
		border: 1px solid var(--line-strong);
		box-shadow:
			0 0 40px rgba(255, 210, 63, 0.15),
			0 1px 0 rgba(255, 255, 255, 0.08) inset;
	}
	h1 {
		margin: 0 0 6px;
		font-size: 26px;
		letter-spacing: -0.02em;
	}
	h1 span {
		color: var(--yellow);
		text-shadow: 0 0 20px rgba(255, 210, 63, 0.45);
	}
	.hero p {
		margin: 0;
		color: var(--text-2);
		max-width: 620px;
	}
	.hero .static {
		margin-top: 8px;
		display: flex;
		align-items: center;
		gap: 6px;
		color: var(--yellow-2);
		font-size: 13px;
	}
	.stats {
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		gap: 10px;
	}
	.stat {
		padding: 12px 14px;
		border-radius: var(--radius);
		background: var(--bg-3);
		border: 1px solid var(--line-soft);
		display: flex;
		flex-direction: column;
	}
	.stat b {
		font-size: 24px;
		font-variant-numeric: tabular-nums;
	}
	.stat span {
		font-size: 12px;
		color: var(--text-3);
	}
	.steps {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 12px;
	}
	.step {
		display: flex;
		gap: 12px;
		padding: 14px;
		border-radius: var(--radius);
		background: var(--bg-3);
		border: 1px solid var(--line-soft);
		animation: fade-up 0.4s both;
	}
	.step h3 {
		margin: 0 0 4px;
		font-size: 14px;
		display: flex;
		align-items: center;
		gap: 7px;
	}
	.n {
		display: grid;
		place-items: center;
		width: 18px;
		height: 18px;
		border-radius: 50%;
		background: var(--yellow);
		color: var(--yellow-ink);
		font-size: 11px;
		font-weight: 700;
	}
	.step p {
		margin: 0;
		font-size: 12.5px;
		color: var(--text-3);
	}
	.actions {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
		gap: 10px;
	}
	.action {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 14px;
		border-radius: var(--radius);
		border: 1px solid var(--line);
		background: linear-gradient(180deg, #17234f, #121b41);
		color: var(--text);
		cursor: pointer;
		text-align: left;
		transition:
			transform 0.15s var(--ease-out),
			box-shadow 0.2s,
			border-color 0.2s;
	}
	.action :global(svg) {
		color: var(--yellow);
	}
	.action:hover {
		transform: translateY(-2px);
		border-color: var(--yellow-a35);
		box-shadow: var(--glow-soft);
	}
	.action.primary {
		border-color: var(--yellow-a35);
		box-shadow: var(--glow-soft);
	}
	.action b {
		display: block;
		font-size: 13.5px;
	}
	.action small {
		display: block;
		color: var(--text-3);
		font-size: 12px;
	}
	.keys {
		font-size: 12px;
		margin: 0;
	}
	@container (max-width: 700px) {
		.steps,
		.stats {
			grid-template-columns: 1fr 1fr;
		}
	}
</style>
