<script lang="ts">
	import type { AttemptDetail } from '$engine/api-types.ts';
	import type { Judgement } from '$engine/core/schema.ts';
	import type { Win } from '../os/wm.svelte.ts';
	import { wm } from '../os/wm.svelte.ts';
	import { benchy } from '../data/store.svelte.ts';
	import { toasts } from '../os/toasts.svelte.ts';
	import Tabs from '../ui/Tabs.svelte';
	import Status from '../ui/Status.svelte';
	import Score from '../ui/Score.svelte';
	import Kind from '../ui/Kind.svelte';
	import Button from '../ui/Button.svelte';
	import Spinner from '../ui/Spinner.svelte';
	import Empty from '../ui/Empty.svelte';
	import Markdown from '../ui/Markdown.svelte';
	import Code from '../ui/Code.svelte';
	import JsonTree from '../ui/JsonTree.svelte';
	import Segmented from '../ui/Segmented.svelte';
	import Menu from '../os/Menu.svelte';
	import Icon from '../os/Icon.svelte';
	import ArtifactPreview from '../viewers/ArtifactPreview.svelte';
	import Gallery from '../viewers/Gallery.svelte';
	import { fmtCost, fmtDate, fmtDuration, fmtNum } from '../ui/format.ts';

	let { win, props }: { win: Win; props: Record<string, unknown> } = $props();
	const id = $derived(String(props.id ?? props.key));

	let detail = $state<AttemptDetail | null>(null);
	let error = $state<string | null>(null);
	let tab = $state('preview');
	let artifactIdx = $state(0);
	let responseView = $state('rendered');
	let response = $state<string | null>(null);
	let reasoning = $state<string | null>(null);
	let judgementFp = $state<string | null>(null);
	let busy = $state<string | null>(null);

	const row = $derived(benchy.attempts.find((a) => a.id === id));
	const rowKey = $derived(
		row ? `${row.stage}|${row.status}|${row.score}|${row.human_score}|${row.error}` : ''
	);

	async function load() {
		try {
			const d = await benchy.api.attempt(id);
			detail = d;
			error = null;
			if (!judgementFp || !d.judgements.some((j) => j.fingerprint === judgementFp))
				judgementFp = d.judgements[0]?.fingerprint ?? null;
			wm.setTitle(
				win.id,
				`${d.row.blueprint_label} × ${d.test?.test.title ?? d.row.test_id}`,
				`#${d.attempt.rep}`
			);
			response = await benchy.api.text(d.files.response);
			reasoning = d.files.reasoning ? await benchy.api.text(d.files.reasoning) : null;
		} catch (e) {
			error = (e as Error).message;
		}
	}

	$effect(() => {
		void rowKey;
		void id;
		load();
	});

	const a = $derived(detail?.attempt);
	const test = $derived(detail?.test?.test);
	const artifacts = $derived(a?.artifacts ?? []);
	const artifact = $derived(artifacts[Math.min(artifactIdx, Math.max(0, artifacts.length - 1))]);
	const judgement = $derived<Judgement | undefined>(
		detail?.judgements.find((j) => j.fingerprint === judgementFp) ?? detail?.judgements[0]
	);
	const images = $derived(
		(a?.evidence ?? [])
			.filter((e) => e.kind === 'image')
			.map((e) => ({ url: benchy.api.fileUrl(`${id}/${e.path}`), label: e.label }))
	);
	const logs = $derived((a?.evidence ?? []).filter((e) => e.kind === 'log'));
	const issueCount = $derived(
		detail?.checks?.results.reduce(
			(n, r) => n + r.issues.filter((i) => i.severity !== 'info').length,
			0
		) ?? 0
	);

	// Human rating form state
	let human = $state<Record<string, number>>({});
	let humanNotes = $state('');
	$effect(() => {
		if (!detail) return;
		human = { ...(detail.human?.criteria ?? {}) };
		humanNotes = detail.human?.notes ?? '';
	});

	async function rejudge(override: Record<string, unknown>, label: string) {
		busy = 'judge';
		try {
			await benchy.api.judge([id], override);
			toasts.push('info', 'Judging…', label);
		} catch (e) {
			toasts.error(e);
		} finally {
			busy = null;
		}
	}

	async function saveHuman() {
		busy = 'human';
		try {
			const criteria = Object.fromEntries(
				Object.entries(human).filter(([, v]) => typeof v === 'number')
			);
			detail = await benchy.api.rateHuman(id, { criteria, notes: humanNotes || undefined });
			toasts.push('ok', 'Rating saved');
		} catch (e) {
			toasts.error(e);
		} finally {
			busy = null;
		}
	}

	function copyLink() {
		const url = `${location.origin}${location.pathname}#/?open=attempt:${id}`;
		navigator.clipboard?.writeText(url).then(() => toasts.push('ok', 'Link copied', url));
	}

	const judgeItems = $derived([
		{
			label: `Re-judge (${benchy.status?.settings?.judge.model ?? 'default'})`,
			icon: 'gavel',
			action: () => rejudge({}, 'default judge')
		},
		{
			label: 'Re-judge statically',
			icon: 'eye',
			action: () => rejudge({ mode_override: 'static' }, 'static mode')
		},
		{
			label: 'Re-judge interactively',
			icon: 'play',
			action: () => rejudge({ mode_override: 'interactive' }, 'interactive mode')
		},
		'sep' as const,
		{
			label: 'Quick check with Haiku',
			icon: 'bolt',
			action: () => rejudge({ model: 'haiku', effort: 'low' }, 'haiku')
		},
		{ label: 'Dry-run judge', icon: 'flask', action: () => rejudge({ kind: 'dry-run' }, 'dry-run') }
	]);

	const metrics = $derived(a?.metrics ?? {});
</script>

{#if error && !detail}
	<Empty icon="error" title="Could not load this attempt">{error}</Empty>
{:else if !detail || !a}
	<Spinner />
{:else}
	<div class="head">
		<div class="grow title-block">
			<div class="row wrap">
				<h2 class="ellipsis">{detail.row.blueprint_label}</h2>
				{#if detail.blueprint}<Kind kind={detail.blueprint.blueprint.kind} />{/if}
				<span class="x">×</span>
				<h2 class="ellipsis t">{test?.title ?? a.test_id}</h2>
				<span class="rep">#{a.rep}</span>
			</div>
			<div class="row meta wrap">
				<button class="link" onclick={() => wm.open('runs', { select: a.run_id })}
					>{detail.run.label ?? a.run_id}</button
				>
				<span>·</span><span>{fmtDate(a.generated_at ?? a.created_at)}</span>
				<span>·</span><span>{detail.run.host.name}</span>
				{#if detail.run.legacy}<span class="legacy">legacy import</span>{/if}
			</div>
		</div>
		<div class="badges">
			<Status status={a.error ? 'failed' : a.stage} />
			<Status status={a.status} label={a.status ? `checks: ${a.status}` : 'no checks'} />
		</div>
		<div class="big-score">
			<Score value={detail.row.score} gate={detail.row.gate_failed} big width={110} />
			<span class="muted small"
				>{detail.row.judge ?? 'not judged'}{detail.row.human_score !== null
					? ` · human ${detail.row.human_score.toFixed(1)}`
					: ''}</span
			>
		</div>
		<div class="head-actions">
			{#if benchy.live && !a.error}
				<Menu items={judgeItems} align="right">
					{#snippet trigger()}
						<Icon name="gavel" size={12} /> Judge {#if busy === 'judge' || a.stage === 'judging'}<span
								class="dotspin"
							></span>{/if}
					{/snippet}
				</Menu>
			{/if}
			<Button
				icon="compare"
				variant="ghost"
				size="sm"
				title="Compare with another attempt"
				onclick={() => wm.open('compare', { left: id })}
			/>
			<Button icon="link" variant="ghost" size="sm" title="Copy link" onclick={copyLink} />
		</div>
	</div>

	<Tabs
		bind:active={tab}
		tabs={[
			{ id: 'preview', label: 'Preview' },
			{ id: 'response', label: 'Response' },
			{ id: 'checks', label: 'Checks', count: issueCount || null },
			{ id: 'verdict', label: 'Verdict', count: detail.judgements.length || null },
			{ id: 'human', label: 'Human' },
			{ id: 'meta', label: 'Meta' }
		]}
	/>

	<div class="body" class:scroll={tab !== 'preview'}>
		{#if tab === 'preview'}
			<div class="preview-tab">
				{#if a.error}
					<div class="fail card">
						<h3><Icon name="error" size={12} /> Generation failed</h3>
						<p class="mono">{a.error.message}</p>
						{#if response}<details open>
								<summary>Partial response</summary><Code
									code={response}
									lang="markdown"
									maxHeight="360px"
									wrap
								/>
							</details>{/if}
					</div>
				{:else if !artifacts.length}
					<Empty icon="file" title="No artifact extracted"
						>{a.extraction?.notes.join(' · ') || 'The response contained nothing usable.'} See the Response
						tab.</Empty
					>
				{:else}
					{#if artifacts.length > 1}
						<div class="art-tabs">
							{#each artifacts as art, i (art.path)}
								<button class:on={i === artifactIdx} onclick={() => (artifactIdx = i)}>
									<Icon
										name={art.kind === 'html'
											? 'html'
											: art.kind === 'model3d'
												? 'cube'
												: art.kind === 'program'
													? 'terminal'
													: 'file'}
										size={14}
									/>
									{art.path.replace(/^artifacts\//, '')}
									{#if !art.declared}<small>extra</small>{/if}
								</button>
							{/each}
						</div>
					{/if}
					{#key artifact.path}
						<ArtifactPreview {detail} {artifact} />
					{/key}
				{/if}
			</div>
		{:else if tab === 'response'}
			<div class="pad col">
				<div class="row">
					<Segmented
						options={[
							{ id: 'rendered', label: 'Rendered' },
							{ id: 'raw', label: 'Raw' }
						]}
						bind:value={responseView}
					/>
					<span class="muted small">{a.extraction ? `extraction: ${a.extraction.method}` : ''}</span
					>
				</div>
				{#if a.extraction?.notes.length}
					<div class="notes">
						{#each a.extraction.notes as n (n)}<span><Icon name="info" size={12} /> {n}</span
							>{/each}
					</div>
				{/if}
				{#if response === null}
					<Spinner />
				{:else if responseView === 'rendered'}
					<div class="card md-card">
						<Markdown
							source={response.length > 300_000
								? response.slice(0, 300_000) + '\n\n… (truncated for display)'
								: response}
						/>
					</div>
				{:else}
					<Code code={response} lang="markdown" wrap />
				{/if}
				{#if reasoning}
					<details class="reasoning">
						<summary
							><Icon name="sparkle" size={12} /> Reasoning trace · {(
								reasoning.length / 1000
							).toFixed(1)}k chars {#if metrics.reasoning_tokens}· {metrics.reasoning_tokens} tokens{/if}</summary
						>
						<Code code={reasoning} lang={null} lineNumbers={false} wrap maxHeight="480px" />
					</details>
				{/if}
			</div>
		{:else if tab === 'checks'}
			<div class="pad col">
				{#if !detail.checks}
					<Empty icon="check" title="No checks yet" />
				{:else}
					<div class="row">
						<Status status={detail.checks.status} label={`overall: ${detail.checks.status}`} /><span
							class="muted small">{fmtDate(detail.checks.finished_at)}</span
						>
					</div>
					{#each detail.checks.results as r (r.id)}
						<div class="card check">
							<div class="row">
								<b class="mono">{r.id}</b>
								<Status status={r.status} />
								<span class="spacer"></span>
								<span class="muted small">{fmtDuration(r.duration_ms)}</span>
							</div>
							{#if r.issues.length}
								<ul class="issues">
									{#each r.issues as i, k (k)}
										<li class={i.severity}>
											<span class="sev">{i.severity}</span>
											<span class="mono kind">{i.kind}</span>
											<span class="msg">{i.message}</span>
											{#if i.line}<span class="loc mono"
													>{i.file ?? ''}:{i.line}{i.col ? `:${i.col}` : ''}</span
												>{/if}
										</li>
									{/each}
								</ul>
							{/if}
							{#if r.data && Object.keys(r.data).length}<details>
									<summary class="muted small">data</summary><JsonTree value={r.data} />
								</details>{/if}
						</div>
					{/each}
					{#if images.length}
						<h4 class="section-title">Evidence</h4>
						<Gallery {images} />
					{/if}
					{#if logs.length}
						<h4 class="section-title">Logs</h4>
						{#each logs as l (l.path)}
							<a
								href={benchy.api.fileUrl(`${id}/${l.path}`)}
								target="_blank"
								rel="noopener noreferrer"><Icon name="terminal" size={12} /> {l.label}</a
							>
						{/each}
					{/if}
				{/if}
			</div>
		{:else if tab === 'verdict'}
			<div class="pad col">
				{#if !judgement}
					<Empty icon="gavel" title="Not judged yet">
						{#if a.judge_error}<p class="err">{a.judge_error}</p>{/if}
						{#if benchy.live && !a.error}<Button
								icon="gavel"
								variant="primary"
								loading={busy === 'judge'}
								onclick={() => rejudge({}, 'default judge')}>Judge now</Button
							>{/if}
					</Empty>
				{:else}
					{#if detail.judgements.length > 1}
						<div class="row">
							<span class="label" style="margin:0">Judgement</span>
							<select class="select" style="width:auto" bind:value={judgementFp}>
								{#each detail.judgements as j (j.fingerprint)}
									<option value={j.fingerprint}
										>{j.judge.kind === 'dry-run'
											? 'dry-run'
											: `${j.judge.model} @ ${j.judge.effort ?? 'default'} · ${j.judge.mode}`} — {j.score?.toFixed(
											1
										) ?? 'error'} · {fmtDate(j.created_at)}</option
									>
								{/each}
							</select>
						</div>
					{/if}
					{#if judgement.error}
						<div class="card fail">
							<h3><Icon name="error" size={12} /> Judge failed</h3>
							<p class="mono">{judgement.error}</p>
						</div>
					{/if}
					{#if judgement.verdict}
						{@const v = judgement.verdict}
						<div class="verdict-head card">
							<Score value={judgement.score} gate={judgement.gate_failed} big width={160} />
							<div class="grow">
								<p class="summary">{v.summary}</p>
								<div class="row wrap small muted">
									<span
										>{judgement.judge.kind === 'dry-run'
											? 'dry-run judge'
											: `${judgement.judge.model} · effort ${judgement.judge.effort ?? 'default'} · ${judgement.judge.mode}`}</span
									>
									<span>·</span><span>confidence {Math.round(v.confidence * 100)}%</span>
									<span>·</span><span>{fmtDuration(judgement.duration_ms)}</span>
									{#if judgement.num_turns}<span>·</span><span>{judgement.num_turns} turns</span
										>{/if}
									{#if judgement.cost_usd}<span>·</span><span>{fmtCost(judgement.cost_usd)}</span
										>{/if}
								</div>
								{#if v.flags.prompt_injection_suspected || v.flags.output_incomplete}
									<div class="flags">
										{#if v.flags.prompt_injection_suspected}<span class="flag bad"
												><Icon name="alert" size={12} /> prompt injection suspected</span
											>{/if}
										{#if v.flags.output_incomplete}<span class="flag warn"
												><Icon name="alert" size={12} /> output incomplete</span
											>{/if}
									</div>
								{/if}
								{#if v.flags.notes}<p class="muted small">{v.flags.notes}</p>{/if}
							</div>
						</div>
						<div class="sw">
							<div class="card">
								<h4 class="section-title">Strengths</h4>
								<ul>
									{#each v.strengths as s (s)}<li>{s}</li>{:else}<li class="muted">—</li>{/each}
								</ul>
							</div>
							<div class="card">
								<h4 class="section-title">Weaknesses</h4>
								<ul>
									{#each v.weaknesses as s (s)}<li>{s}</li>{:else}<li class="muted">—</li>{/each}
								</ul>
							</div>
						</div>
						{#each judgement.criteria as c (c.id)}
							{@const vc = v.criteria.find((x) => x.id === c.id)}
							<div class="card crit" class:gate={c.required && (vc?.score ?? 0) < 5}>
								<div class="row">
									<b>{c.title}</b>
									<span class="mono muted small">{c.id}</span>
									<span class="w">×{c.weight}</span>
									{#if c.required}<span class="req">required</span>{/if}
									<span class="spacer"></span>
									<Score value={vc ? vc.score * 10 : null} width={140} />
									<span class="muted small">{vc ? `${vc.score}/10` : 'missing'}</span>
								</div>
								{#if c.description}<p class="desc">{c.description}</p>{/if}
								{#if vc}
									<p class="rationale">{vc.rationale}</p>
									{#if vc.evidence.length}
										<ul class="evidence">
											{#each vc.evidence as e (e)}<li>{e}</li>{/each}
										</ul>
									{/if}
								{/if}
							</div>
						{/each}
					{/if}
				{/if}
			</div>
		{:else if tab === 'human'}
			<div class="pad col">
				<p class="muted">
					Your own scores sit next to the judge's. The leaderboard can rank by judge, human or a
					blend (human wins where it exists) — and differences show where the judge needs
					calibration.
				</p>
				{#each test?.judge.criteria ?? [] as c (c.id)}
					{@const judgeScore = judgement?.verdict?.criteria.find((x) => x.id === c.id)?.score}
					<div class="card hcrit">
						<div class="row">
							<b>{c.title}</b>
							<span class="w">×{c.weight}</span>
							{#if c.required}<span class="req">required</span>{/if}
							<span class="spacer"></span>
							{#if judgeScore !== undefined}<span class="muted small">judge {judgeScore}/10</span
								>{/if}
							<b class="hval">{human[c.id] ?? '—'}</b>
						</div>
						{#if c.description}<p class="desc">{c.description}</p>{/if}
						<input
							type="range"
							min="0"
							max="10"
							step="0.5"
							value={human[c.id] ?? 5}
							disabled={!benchy.live}
							oninput={(e) => (human[c.id] = Number((e.target as HTMLInputElement).value))}
						/>
					</div>
				{/each}
				<label class="label" for="hn-{win.id}">Notes</label>
				<textarea
					id="hn-{win.id}"
					class="textarea"
					rows="3"
					bind:value={humanNotes}
					disabled={!benchy.live}
					placeholder="What the judge missed, what you liked…"></textarea>
				{#if benchy.live}
					<div class="row">
						<Button variant="primary" icon="save" loading={busy === 'human'} onclick={saveHuman}
							>Save rating</Button
						>
						{#if detail.human}<Button
								variant="ghost"
								icon="trash"
								onclick={async () => (detail = await benchy.api.clearHuman(id))}>Clear</Button
							>{/if}
						<span class="spacer"></span>
						{#if detail.row.human_score !== null}<span
								>human score <b>{detail.row.human_score.toFixed(1)}</b></span
							>{/if}
					</div>
				{/if}
			</div>
		{:else if tab === 'meta'}
			<div class="pad col">
				<div class="metrics">
					<div><span>latency</span><b>{fmtDuration(metrics.latency_ms)}</b></div>
					<div><span>time to first token</span><b>{fmtDuration(metrics.ttft_ms)}</b></div>
					<div><span>model load</span><b>{fmtDuration(metrics.load_ms)}</b></div>
					<div><span>prompt tokens</span><b>{fmtNum(metrics.prompt_tokens, 0)}</b></div>
					<div><span>completion tokens</span><b>{fmtNum(metrics.completion_tokens, 0)}</b></div>
					<div><span>reasoning tokens</span><b>{fmtNum(metrics.reasoning_tokens, 0)}</b></div>
					<div><span>prompt t/s</span><b>{fmtNum(metrics.prompt_tps)}</b></div>
					<div><span>generation t/s</span><b>{fmtNum(metrics.gen_tps)}</b></div>
					<div>
						<span>draft accepted</span><b
							>{metrics.draft_n
								? `${metrics.draft_accepted ?? 0}/${metrics.draft_n} (${Math.round(((metrics.draft_accepted ?? 0) / metrics.draft_n) * 100)}%)`
								: '—'}</b
						>
					</div>
					<div><span>cost</span><b>{fmtCost(metrics.cost_usd)}</b></div>
					<div><span>finish</span><b>{metrics.finish_reason ?? '—'}</b></div>
					<div><span>turns</span><b>{metrics.num_turns ?? '—'}</b></div>
				</div>
				{#if detail.llama}
					<div class="card">
						<h4 class="section-title">llama.cpp</h4>
						<div class="kv">
							<span>mode</span><b>{detail.llama.mode}</b>
							<span>build</span><b class="mono">{detail.llama.build ?? '—'}</b>
							<span>GPU</span><b>{detail.llama.gpu?.join(', ') || '—'}</b>
							{#if detail.llama.load_ms}<span>load time</span><b
									>{fmtDuration(detail.llama.load_ms)}</b
								>{/if}
						</div>
						{#if detail.llama.section}
							<h4 class="section-title" style="margin-top:12px">Preset section</h4>
							<div class="kv">
								{#each Object.entries(detail.llama.section) as [k, val] (k)}<span class="mono"
										>{k}</span
									><b class="mono">{val}</b>{/each}
							</div>
						{/if}
						{#if detail.llama.args}
							<h4 class="section-title" style="margin-top:12px">Launch argv (from the router)</h4>
							<Code code={detail.llama.args.join(' \\\n  ')} lang="bash" lineNumbers={false} wrap />
						{/if}
						{#if detail.llama.props}<details>
								<summary class="muted small">/props</summary><JsonTree value={detail.llama.props} />
							</details>{/if}
					</div>
				{/if}
				{#if detail.blueprint}
					<div class="card">
						<h4 class="section-title">
							Blueprint snapshot <span class="mono">{detail.blueprint.hash}</span>
						</h4>
						{#if detail.blueprint.blueprint.origin?.reconstructed}<p class="warn small">
								<Icon name="alert" size={12} />
								{detail.blueprint.blueprint.origin.note}
							</p>{/if}
						<JsonTree value={detail.blueprint.blueprint} open />
					</div>
				{/if}
				{#if detail.test}
					<div class="card">
						<h4 class="section-title">
							Task as sent <span class="mono">{detail.test.task_hash}</span>
						</h4>
						{#if detail.test.test.system}<p class="small muted">
								System: {detail.test.test.system}
							</p>{/if}
						<Code
							code={detail.test.test.prompt}
							lang="markdown"
							lineNumbers={false}
							wrap
							maxHeight="320px"
						/>
					</div>
				{/if}
				<div class="card">
					<h4 class="section-title">Host</h4>
					<JsonTree value={detail.run.host} open />
				</div>
				{#if detail.files.raw}<a href={detail.files.raw} target="_blank" rel="noopener noreferrer"
						><Icon name="external" size={12} /> raw.json</a
					>{/if}
			</div>
		{/if}
	</div>
{/if}

<style>
	.head {
		display: flex;
		gap: var(--sp-6);
		align-items: center;
		padding: var(--sp-5) var(--sp-6);
		border-bottom: var(--bw) solid var(--line-soft);
	}
	.title-block {
		min-width: 0;
	}
	h2 {
		margin: 0;
		font-size: var(--fs-l);
		max-width: 360px;
	}
	h2.t {
		color: var(--fg-2);
		font-weight: var(--fw);
	}
	.x {
		color: var(--fg-3);
	}
	.rep {
		color: var(--fg-3);
		font-variant-numeric: tabular-nums;
	}
	.meta {
		font-size: var(--fs-s);
		color: var(--fg-3);
		gap: var(--sp-3);
		margin-top: var(--sp-2);
	}
	.link {
		background: none;
		border: 0;
		padding: 0;
		cursor: pointer;
		font-size: var(--fs-s);
		color: var(--fg-2);
		text-decoration: underline;
	}
	.legacy {
		padding: 0 var(--sp-3);
		border: var(--bw) solid var(--line);
		font-size: var(--fs-xs);
	}
	.badges {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
		align-items: flex-end;
	}
	.big-score {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: var(--sp-2);
	}
	.small {
		font-size: var(--fs-s);
	}
	.head-actions {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
	}
	.dotspin {
		width: 10px;
		height: 10px;
		border-right-color: transparent;
		animation: spin var(--dur-3) linear infinite;
		border: 2px solid var(--fg);
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	.body {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}
	.preview-tab {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
		padding: var(--sp-5);
	}
	.art-tabs {
		display: flex;
		gap: var(--sp-2);
		flex-wrap: wrap;
	}
	.art-tabs button {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-3);
		height: 28px;
		padding: 0 var(--sp-5);
		border: var(--bw) solid var(--line-soft);
		background: var(--surface-2);
		color: var(--fg-2);
		cursor: pointer;
		font-family: var(--font);
		font-size: var(--fs-s);
	}
	.art-tabs button.on {
		color: var(--fg);
		border-color: var(--line-strong);
		box-shadow: inset 0 -2px 0 var(--accent);
	}
	.art-tabs small {
		font-family: var(--font);
		color: var(--fg-4);
	}
	.fail h3 {
		margin: 0 0 var(--sp-3);
		display: flex;
		gap: var(--sp-4);
		align-items: center;
		color: var(--bad);
		font-size: var(--fs-l);
		--icon-accent: var(--bad);
	}
	.fail p {
		white-space: pre-wrap;
		font-size: var(--fs-m);
	}
	.notes {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
		font-size: var(--fs-s);
		color: var(--fg-3);
	}
	.md-card {
		padding: var(--sp-2) var(--sp-7) var(--sp-6);
	}
	.reasoning summary {
		cursor: pointer;
		color: var(--fg-2);
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		padding: var(--sp-3) 0;
	}
	.check .issues {
		list-style: none;
		margin: var(--sp-4) 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}
	.issues li {
		display: flex;
		gap: var(--sp-4);
		align-items: baseline;
		font-size: var(--fs-m);
		padding: var(--sp-2) var(--sp-4);
		background: var(--sunken);
	}
	.issues .sev {
		font-size: var(--fs-xs);
		font-weight: var(--fw-strong);
		text-transform: uppercase;
		min-width: 52px;
	}
	.issues .error .sev {
		color: var(--bad);
	}
	.issues .warning .sev {
		color: var(--warn);
	}
	.issues .info .sev {
		color: var(--info);
	}
	.issues .kind {
		color: var(--fg-3);
		font-size: var(--fs-s);
	}
	.issues .msg {
		flex: 1;
		word-break: break-word;
		color: var(--fg-2);
	}
	.issues .loc {
		color: var(--fg-4);
		font-size: var(--fs-xs);
	}
	.verdict-head {
		display: flex;
		gap: var(--sp-6);
		align-items: flex-start;
	}
	.summary {
		margin: 0 0 var(--sp-3);
		color: var(--fg);
		line-height: 1.55;
	}
	.flags {
		display: flex;
		gap: var(--sp-3);
		margin-top: var(--sp-3);
	}
	.flag {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-2);
		font-size: var(--fs-s);
		padding: var(--sp-1) var(--sp-4);
		border: var(--bw) solid;
	}
	.flag.bad {
		color: var(--bad);
		--icon-accent: var(--bad);
	}
	.flag.warn {
		color: var(--warn);
		--icon-accent: var(--warn);
	}
	.sw {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--sp-5);
	}
	.sw ul {
		margin: 0;
		padding-left: var(--sp-6);
		font-size: var(--fs-m);
		color: var(--fg-2);
	}
	.crit.gate {
		border-color: var(--bad);
	}
	.w {
		font-size: var(--fs-xs);
		color: var(--fg-3);
		font-variant-numeric: tabular-nums;
	}
	.req {
		font-size: var(--fs-xs);
		font-weight: var(--fw-strong);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		padding: var(--sp-1) var(--sp-3);
		color: var(--fg-2);
		border: var(--bw) solid var(--line-strong);
	}
	.desc {
		margin: var(--sp-2) 0 0;
		font-size: var(--fs-s);
		color: var(--fg-3);
	}
	.rationale {
		margin: var(--sp-4) 0 0;
		color: var(--fg-2);
		font-size: var(--fs-m);
	}
	.evidence {
		margin: var(--sp-3) 0 0;
		padding-left: var(--sp-6);
		font-size: var(--fs-s);
		color: var(--fg-3);
		font-family: var(--font);
	}
	.hcrit input[type='range'] {
		width: 100%;
		accent-color: var(--accent);
		margin-top: var(--sp-4);
	}
	.hval {
		min-width: 30px;
		text-align: right;
		color: var(--fg);
	}
	.metrics {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
		gap: var(--sp-4);
	}
	.metrics div {
		display: flex;
		flex-direction: column;
		padding: var(--sp-4) var(--sp-5);
		background: var(--surface-2);
		border: var(--bw) solid var(--line-soft);
	}
	.metrics span {
		font-size: var(--fs-xs);
		color: var(--fg-3);
	}
	.metrics b {
		font-size: var(--fs-l);
		font-variant-numeric: tabular-nums;
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
		word-break: break-all;
	}
	.warn {
		color: var(--warn);
		--icon-accent: var(--warn);
	}
	.err {
		color: var(--bad);
	}
	details summary {
		cursor: pointer;
		margin-top: var(--sp-4);
	}
</style>
