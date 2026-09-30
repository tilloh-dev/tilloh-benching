<script lang="ts">
	import type { PreflightReport } from '$engine/run/preflight.ts';
	import type { RunSpec } from '$engine/core/schema.ts';
	import type { Win } from '../os/wm.svelte.ts';
	import { wm } from '../os/wm.svelte.ts';
	import { benchy } from '../data/store.svelte.ts';
	import { toasts } from '../os/toasts.svelte.ts';
	import Button from '../ui/Button.svelte';
	import Kind from '../ui/Kind.svelte';
	import Icon from '../os/Icon.svelte';

	let { win: _win, props }: { win: Win; props: Record<string, unknown> } = $props();

	let bpFilter = $state('');
	let selectedBps = $state<string[]>([]);
	let suite = $state('');
	let selectedTests = $state<string[]>([]);
	let reps = $state(1);
	/** '' = the default profile, 'none' = skip judging, else a profile id. */
	let judgeProfile = $state('');
	let judgeMode = $state('');
	let label = $state('');
	let preflight = $state<PreflightReport | null>(null);
	let busy = $state<string | null>(null);

	$effect(() => {
		const pre = props.blueprints as string[] | undefined;
		if (pre?.length) selectedBps = [...pre];
		const t = props.tests as string[] | undefined;
		if (t?.length) selectedTests = [...t];
	});

	const blueprints = $derived((benchy.library?.blueprints ?? []).filter((b) => b.resolved));
	const groups = $derived.by(() => {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- local to a $derived computation
		const out = new Map<string, typeof blueprints>();
		for (const b of blueprints) {
			if (
				bpFilter &&
				!`${b.id} ${b.file.label ?? ''} ${(b.resolved?.tags ?? []).join(' ')}`
					.toLowerCase()
					.includes(bpFilter.toLowerCase())
			)
				continue;
			const k = b.resolved!.kind;
			out.set(k, [...(out.get(k) ?? []), b]);
		}
		return [...out.entries()];
	});
	const tests = $derived((benchy.library?.tests ?? []).filter((t) => t.resolved));
	const suites = $derived(benchy.library?.suites ?? []);

	$effect(() => {
		const s = suites.find((x) => x.id === suite);
		if (s) {
			selectedTests = [...s.tests];
			if (s.repetitions) reps = s.repetitions;
			if (s.blueprints?.length && !selectedBps.length) selectedBps = [...s.blueprints];
		}
	});

	function toggle(list: string[], id: string): string[] {
		return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
	}

	const total = $derived(selectedBps.length * selectedTests.length * reps);
	const spec = $derived<RunSpec>({
		label: label || undefined,
		suite: suite || undefined,
		blueprints: selectedBps,
		tests: selectedTests,
		repetitions: reps,
		judge:
			judgeProfile === 'none'
				? { kind: 'none' }
				: {
						profile: judgeProfile || undefined,
						mode_override: judgeMode ? (judgeMode as never) : undefined
					}
	});
	$effect(() => {
		void spec;
		preflight = null;
	});

	async function check() {
		busy = 'preflight';
		try {
			preflight = await benchy.api.preflight(spec);
		} catch (e) {
			toasts.error(e);
		} finally {
			busy = null;
		}
	}

	async function start() {
		busy = 'start';
		try {
			if (!preflight) preflight = await benchy.api.preflight(spec);
			if (!preflight.ok && !confirm('The preflight reports errors. Start anyway?')) return;
			const { run } = await benchy.api.createRun(spec, true);
			toasts.push('ok', 'Run started', run.id);
			wm.open('runs', { select: run.id });
		} catch (e) {
			toasts.error(e);
		} finally {
			busy = null;
		}
	}
</script>

<div class="launcher">
	<section class="pane">
		<header>
			<h3><span class="step">1</span>Blueprints</h3>
			<input class="input" placeholder="Filter…" bind:value={bpFilter} />
		</header>
		<div class="list scroll">
			{#each groups as [kind, items] (kind)}
				<div class="group">
					<div class="group-head">
						<Kind {kind} />
						<button
							class="all"
							onclick={() =>
								(selectedBps = items.every((b) => selectedBps.includes(b.id))
									? selectedBps.filter((x) => !items.some((b) => b.id === x))
									: [...new Set([...selectedBps, ...items.map((b) => b.id)])])}
						>
							{items.every((b) => selectedBps.includes(b.id)) ? 'none' : 'all'}
						</button>
					</div>
					{#each items as b (b.id)}
						<label class="opt" class:on={selectedBps.includes(b.id)}>
							<input
								type="checkbox"
								checked={selectedBps.includes(b.id)}
								onchange={() => (selectedBps = toggle(selectedBps, b.id))}
							/>
							<span class="grow">
								<b class="ellipsis">{b.file.label ?? b.id}</b>
								<small class="mono ellipsis">{b.id} · {b.hash}</small>
							</span>
						</label>
					{/each}
				</div>
			{:else}
				<p class="muted pad">No blueprints. Create one in the Blueprints app.</p>
			{/each}
		</div>
	</section>

	<section class="pane">
		<header>
			<h3><span class="step">2</span>Tests</h3>
			<select class="select" bind:value={suite}>
				<option value="">Pick tests or a suite…</option>
				{#each suites as s (s.id)}<option value={s.id}>{s.title} ({s.tests.length})</option>{/each}
			</select>
		</header>
		<div class="list scroll">
			{#each tests as t (t.id)}
				<label class="opt" class:on={selectedTests.includes(t.id)}>
					<input
						type="checkbox"
						checked={selectedTests.includes(t.id)}
						onchange={() => (selectedTests = toggle(selectedTests, t.id))}
					/>
					<span class="grow">
						<b class="ellipsis">{t.file.title}</b>
						<small class="ellipsis"
							>{t.id} · {t.resolved?.output.mode} · {t.resolved?.judge.criteria.length} criteria · {t
								.resolved?.judge.mode}</small
						>
					</span>
				</label>
			{/each}
		</div>
	</section>

	<section class="pane opts">
		<header><h3><span class="step">3</span>Run</h3></header>
		<div class="form scroll">
			<label class="label" for="l-label">Label</label>
			<input
				id="l-label"
				class="input"
				placeholder="optional, e.g. 'qwen effort sweep'"
				bind:value={label}
			/>

			<label class="label" for="l-reps">Repetitions per cell</label>
			<div class="row">
				<input id="l-reps" type="range" min="1" max="10" bind:value={reps} /><b class="reps"
					>{reps}</b
				>
			</div>

			<span class="label">Judge</span>
			<select class="select" bind:value={judgeProfile} aria-label="Judge profile">
				{#each benchy.library?.judges ?? [] as j (j.profile.id)}
					<option value={j.default ? '' : j.profile.id}
						>{j.profile.label ?? j.profile.id}{j.default ? ' — default' : ''}{j.key_set === false
							? ' (API key missing)'
							: ''}</option
					>
				{/each}
				<option value="none">None — judge later</option>
			</select>
			<p class="hint muted">
				Profiles live in the Judge app. Every profile adds one vote to the score.
			</p>
			{#if judgeProfile !== 'none'}
				<label class="label" for="l-mode">Judge depth</label>
				<select id="l-mode" class="select" bind:value={judgeMode}>
					<option value="">per test (static / interactive)</option>
					<option value="static">force static — cheaper</option>
					<option value="interactive">force interactive — thorough</option>
				</select>
			{/if}

			<div class="summary">
				<span
					><b>{selectedBps.length}</b> blueprints × <b>{selectedTests.length}</b> tests ×
					<b>{reps}</b>
					= <b class="total">{total}</b> attempts</span
				>
			</div>

			{#if preflight}
				<div class="preflight" class:ok={preflight.ok}>
					{#each preflight.items as i (i.scope + i.message)}
						<div class="pf {i.level}">
							<Icon
								name={i.level === 'ok' ? 'check' : i.level === 'warn' ? 'alert' : 'error'}
								size={14}
							/>
							<b class="ellipsis">{i.scope}</b>
							<span>{i.message}</span>
						</div>
					{/each}
				</div>
			{/if}
		</div>
		<footer>
			<Button icon="check" disabled={!total} loading={busy === 'preflight'} onclick={check}
				>Preflight</Button
			>
			<span class="spacer"></span>
			<Button
				icon="play"
				variant="primary"
				disabled={!total}
				loading={busy === 'start'}
				onclick={start}>Start run</Button
			>
		</footer>
	</section>
</div>

<style>
	.hint {
		margin: var(--sp-1) 0 0;
		font-size: var(--fs-s);
	}
	.launcher {
		flex: 1;
		min-height: 0;
		display: grid;
		grid-template-columns: 1fr 1fr 1.05fr;
	}
	.pane {
		display: flex;
		flex-direction: column;
		min-height: 0;
		border-right: var(--bw) solid var(--line-soft);
	}
	.pane:last-child {
		border-right: 0;
	}
	header {
		flex: none;
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
		padding: var(--sp-5);
		border-bottom: var(--bw) solid var(--line-soft);
	}
	h3 {
		margin: 0;
		font-size: var(--fs-l);
		display: flex;
		align-items: center;
		gap: var(--sp-4);
	}
	.step {
		display: grid;
		place-items: center;
		width: 20px;
		height: 20px;
		font-size: var(--fs-xs);
		font-weight: var(--fw-strong);
		color: var(--fg-2);
		border: var(--bw) solid var(--line-strong);
	}
	.list {
		flex: 1;
		padding: var(--sp-3);
	}
	.group {
		margin-bottom: var(--sp-4);
	}
	.group-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: var(--sp-3) var(--sp-3) var(--sp-2);
	}
	.all {
		background: none;
		border: 0;
		color: var(--fg-3);
		cursor: pointer;
		font-size: var(--fs-s);
	}
	.all:hover {
		color: var(--fg);
	}
	.opt {
		display: flex;
		align-items: center;
		gap: var(--sp-5);
		padding: var(--sp-4) var(--sp-4);
		border: var(--bw) solid transparent;
		cursor: pointer;
		transition:
			background var(--dur-2),
			border-color var(--dur-2);
	}
	.opt:hover {
		background: var(--hover);
	}
	.opt.on {
		background: var(--accent-soft);
		border-color: var(--accent);
	}
	.opt input {
		accent-color: var(--accent);
		width: 15px;
		height: 15px;
	}
	.opt b {
		display: block;
		font-weight: var(--fw);
		font-size: var(--fs-m);
		color: var(--fg);
	}
	.opt small {
		display: block;
		font-size: var(--fs-xs);
		color: var(--fg-3);
	}
	.form {
		flex: 1;
		padding: var(--sp-5);
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}
	.form .label {
		margin-top: var(--sp-5);
	}
	.two {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--sp-4);
	}
	input[type='range'] {
		flex: 1;
		accent-color: var(--accent);
	}
	.reps {
		min-width: 22px;
		text-align: right;
		color: var(--fg);
	}
	.summary {
		margin-top: var(--sp-6);
		padding: var(--sp-5) var(--sp-5);
		background: var(--surface-2);
		border: var(--bw) solid var(--line-soft);
		font-size: var(--fs-m);
		color: var(--fg-2);
	}
	.total {
		font-size: var(--fs-l);
		color: var(--fg);
	}
	.preflight {
		margin-top: var(--sp-5);
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
		padding: var(--sp-4);
		border: var(--bw) solid var(--bad);
		animation: appear var(--dur-3) both;
	}
	.preflight.ok {
		border-color: var(--ok);
	}
	.pf {
		display: grid;
		grid-template-columns: 16px minmax(80px, 150px) 1fr;
		gap: var(--sp-4);
		align-items: baseline;
		font-size: var(--fs-s);
		color: var(--fg-2);
	}
	.pf span {
		word-break: break-word;
	}
	.pf.ok {
		--icon-accent: var(--ok);
		color: var(--fg-2);
	}
	.pf.ok :global(svg) {
		color: var(--ok);
	}
	.pf.warn :global(svg) {
		color: var(--warn);
		--icon-accent: var(--warn);
	}
	.pf.error :global(svg) {
		color: var(--bad);
		--icon-accent: var(--bad);
	}
	footer {
		flex: none;
		display: flex;
		gap: var(--sp-4);
		padding: var(--sp-5) var(--sp-5);
		border-top: var(--bw) solid var(--line-soft);
		background: var(--surface);
	}
</style>
