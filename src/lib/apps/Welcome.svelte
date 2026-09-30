<script lang="ts">
	import type { Win } from '../os/wm.svelte.ts';
	import { wm } from '../os/wm.svelte.ts';
	import { benchy } from '../data/store.svelte.ts';
	import Logo from '../os/Logo.svelte';
	import Icon from '../os/Icon.svelte';

	let { win: _win }: { win: Win } = $props();

	const judged = $derived(benchy.attempts.filter((a) => a.judge_score !== null).length);
	const stats = $derived([
		['runs', benchy.runs.length],
		['attempts', benchy.attempts.length],
		['judged', judged],
		['blueprints', benchy.library?.blueprints.length ?? 0],
		['tests', benchy.library?.tests.length ?? 0]
	]);

	const steps = [
		[
			'blueprint',
			'Blueprints',
			'A model plus every setting that matters — llama.cpp flags, sampling, effort, system prompt. Versioned by hash.'
		],
		[
			'flask',
			'Bench tests',
			'A prompt, the files you expect back, automated checks and the criteria a judge scores.'
		],
		[
			'gavel',
			'Independent judge',
			'claude -p inspects code, screenshots and logs — blind to the model — and scores every criterion.'
		]
	];

	const actions = $derived(
		[
			['trophy', 'leaderboard', 'Leaderboard', 'who wins, on what, how fast', true],
			['play', 'launcher', 'New run', 'blueprints × tests, with preflight', benchy.live],
			['rocket', 'runs', 'Runs', 'live progress, logs, results', true],
			['flask', 'tests', 'Bench tests', 'prompts and judge criteria', true]
		].filter((a) => a[4]) as [string, string, string, string, boolean][]
	);
</script>

<div class="welcome scroll">
	<section class="hero">
		<Logo size={36} />
		<div>
			<h1>BenchyOS</h1>
			<p class="caret">benchmark local and remote models against your own prompts</p>
			{#if !benchy.live}
				<p class="muted">Read-only export from {benchy.status?.host.name}.</p>
			{/if}
		</div>
	</section>

	<dl class="stats">
		{#each stats as [label, value] (label)}
			<div>
				<dt>{label}</dt>
				<dd>{value}</dd>
			</div>
		{/each}
	</dl>

	<section>
		<h2 class="section-title">How it works</h2>
		<ol class="steps">
			{#each steps as [icon, title, text], i (title)}
				<li>
					<span class="n">{i + 1}</span>
					<Icon name={icon} size={24} />
					<div>
						<b>{title}</b>
						<p>{text}</p>
					</div>
				</li>
			{/each}
		</ol>
	</section>

	<section>
		<h2 class="section-title">Open</h2>
		<div class="actions">
			{#each actions as [icon, app, title, sub] (app)}
				<button class="action" onclick={() => wm.open(app)}>
					<Icon name={icon} size={12} />
					<b>{title}</b>
					<span class="muted">{sub}</span>
				</button>
			{/each}
		</div>
	</section>

	<p class="muted keys">
		<kbd>Ctrl K</kbd> search · double-click desktop icons · drag windows to screen edges to snap
	</p>
</div>

<style>
	.welcome {
		height: 100%;
		padding: var(--sp-6);
		display: flex;
		flex-direction: column;
		gap: var(--sp-6);
	}
	.hero {
		display: flex;
		gap: var(--sp-5);
		align-items: center;
	}
	h1 {
		margin: 0;
		font-size: var(--fs-xl);
	}
	.hero p {
		margin: var(--sp-1) 0 0;
		color: var(--fg-2);
	}
	.stats {
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		margin: 0;
		border: var(--bw) solid var(--line);
	}
	.stats div {
		padding: var(--sp-3) var(--sp-4);
		border-right: var(--bw) solid var(--line);
	}
	.stats div:last-child {
		border-right: 0;
	}
	dt {
		font-size: var(--fs-xs);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--fg-3);
	}
	dd {
		margin: 0;
		font-size: var(--fs-xl);
		font-weight: var(--fw-strong);
		font-variant-numeric: tabular-nums;
	}
	.steps {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		border: var(--bw) solid var(--line);
	}
	.steps li {
		display: flex;
		gap: var(--sp-4);
		padding: var(--sp-4);
		border-right: var(--bw) solid var(--line);
		color: var(--fg-2);
	}
	.steps li:last-child {
		border-right: 0;
	}
	.n {
		color: var(--fg-3);
	}
	.steps b {
		color: var(--fg);
	}
	.steps p {
		margin: var(--sp-1) 0 0;
		font-size: var(--fs-s);
		color: var(--fg-3);
	}
	.actions {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: var(--sp-3);
	}
	.action {
		display: grid;
		grid-template-columns: 12px 1fr;
		gap: var(--sp-1) var(--sp-3);
		align-items: center;
		padding: var(--sp-3) var(--sp-4);
		border: var(--bw) solid var(--line-strong);
		background: var(--surface);
		color: var(--fg);
		text-align: left;
		cursor: pointer;
		transition: border-color var(--dur-1);
	}
	.action:hover {
		border-color: var(--fg-3);
		background: var(--hover);
	}
	.action span {
		grid-column: 2;
		font-size: var(--fs-s);
	}
	.keys {
		margin: 0;
		font-size: var(--fs-s);
	}
</style>
