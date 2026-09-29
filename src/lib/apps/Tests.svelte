<script lang="ts">
	import type { CriteriaSuggestion, TestFile } from '$engine/core/schema.ts';
	import type { Win } from '../os/wm.svelte.ts';
	import { wm } from '../os/wm.svelte.ts';
	import { benchy } from '../data/store.svelte.ts';
	import { toasts } from '../os/toasts.svelte.ts';
	import Split from '../ui/Split.svelte';
	import ListItem from '../ui/ListItem.svelte';
	import Button from '../ui/Button.svelte';
	import Empty from '../ui/Empty.svelte';
	import Tabs from '../ui/Tabs.svelte';
	import Markdown from '../ui/Markdown.svelte';
	import Segmented from '../ui/Segmented.svelte';
	import Toggle from '../ui/Toggle.svelte';
	import Score from '../ui/Score.svelte';
	import Icon from '../os/Icon.svelte';
	import { leaderboard } from '$engine/core/rows.ts';

	let { win: _win, props }: { win: Win; props: Record<string, unknown> } = $props();

	type Crit = { id: string; title: string; description: string; weight: number; required: boolean };
	type CheckRow = { id: string; options: string };
	type FileRow = { path: string; kind: string; required: boolean; description: string };

	let selected = $state<string | null>(null);
	let originalId = $state<string | null>(null);
	let draft = $state<TestFile | null>(null);
	let prompt = $state('');
	let tagsText = $state('');
	let files = $state<FileRow[]>([]);
	let checks = $state<CheckRow[]>([]);
	let useDefaultChecks = $state(false);
	let criteria = $state<Crit[]>([]);
	let judgeMode = $state('static');
	let guidance = $state('');
	let includeReasoning = $state(false);
	let dirty = $state(false);
	let tab = $state('prompt');
	let promptView = $state('edit');
	let filter = $state('');
	let busy = $state<string | null>(null);
	let suggestion = $state<CriteriaSuggestion | null>(null);
	let checkError = $state<string | null>(null);

	const entries = $derived(benchy.library?.tests ?? []);
	const visible = $derived(
		entries.filter(
			(t) =>
				!filter ||
				`${t.id} ${t.file.title} ${(t.file.tags ?? []).join(' ')}`
					.toLowerCase()
					.includes(filter.toLowerCase())
		)
	);
	const entry = $derived(entries.find((t) => t.id === selected));
	const issues = $derived(
		(benchy.library?.issues ?? []).filter(
			(i) => selected && i.file.startsWith(`tests/${selected}/`)
		)
	);
	const readonly = $derived(!benchy.live);
	const checkIds = $derived(benchy.library?.checks.map((c) => c.id) ?? []);
	const board = $derived(
		selected
			? leaderboard(benchy.attempts.filter((a) => a.test_id === selected)).rows.slice(0, 5)
			: []
	);
	const totalWeight = $derived(criteria.reduce((a, c) => a + (Number(c.weight) || 0), 0));

	$effect(() => {
		const want = props.select as string | undefined;
		if (want && want !== selected) select(want);
	});
	$effect(() => {
		if (!selected && !draft && entries.length) select(entries[0].id);
	});

	function load(file: TestFile, promptText: string) {
		draft = structuredClone($state.snapshot(file)) as TestFile;
		prompt = promptText;
		tagsText = (file.tags ?? []).join(', ');
		files = (file.output?.files ?? []).map((f) => ({
			path: f.path,
			kind: f.kind ?? '',
			required: f.required !== false,
			description: f.description ?? ''
		}));
		useDefaultChecks = !file.checks;
		checks = (file.checks ?? []).map((c) =>
			typeof c === 'string'
				? { id: c, options: '' }
				: { id: Object.keys(c)[0], options: JSON.stringify(Object.values(c)[0] ?? {}, null, 1) }
		);
		criteria = (file.judge?.criteria ?? []).map((c) => ({
			id: c.id,
			title: c.title,
			description: c.description ?? '',
			weight: c.weight ?? 1,
			required: c.required ?? false
		}));
		judgeMode = file.judge?.mode ?? 'static';
		guidance = file.judge?.guidance ?? '';
		includeReasoning = file.judge?.include_reasoning ?? false;
		suggestion = null;
		checkError = null;
		dirty = false;
	}

	function select(id: string) {
		if (dirty && !confirm('Discard unsaved changes?')) return;
		const e = entries.find((t) => t.id === id);
		selected = id;
		originalId = id;
		if (e) load(e.file, e.prompt);
	}

	function newTest() {
		if (dirty && !confirm('Discard unsaved changes?')) return;
		const n = String(entries.length + 1).padStart(2, '0');
		selected = null;
		originalId = null;
		load(
			{ id: `${n}-new-test`, title: 'New test', output: { files: [{ path: 'index.html' }] } },
			'Build a self-contained HTML page that …\n\nRequirements:\n- Single .html file. Inline CSS and JS only. No external resources.\n- …\n- Must be valid HTML5. Must not throw any JavaScript errors when loaded.'
		);
		dirty = true;
		tab = 'prompt';
	}

	function assemble(): TestFile | null {
		if (!draft) return null;
		const parsedChecks: TestFile['checks'] = [];
		for (const c of checks) {
			if (!c.id.trim()) continue;
			if (!c.options.trim() || c.options.trim() === '{}') parsedChecks.push(c.id.trim());
			else {
				try {
					parsedChecks.push({ [c.id.trim()]: JSON.parse(c.options) });
				} catch (e) {
					checkError = `${c.id}: ${(e as Error).message}`;
					tab = 'checks';
					return null;
				}
			}
		}
		checkError = null;
		const tags = tagsText
			.split(',')
			.map((t) => t.trim())
			.filter(Boolean);
		const out: TestFile = {
			id: draft.id.trim(),
			title: draft.title,
			description: draft.description || undefined,
			tags: tags.length ? tags : undefined,
			prompt_file: draft.prompt_file,
			system: draft.system || undefined,
			inputs: draft.inputs,
			output: {
				mode: draft.output?.mode,
				files: files
					.filter((f) => f.path.trim())
					.map((f) => ({
						path: f.path.trim(),
						kind: f.kind || undefined,
						required: f.required ? undefined : false,
						description: f.description || undefined
					})),
				instructions: draft.output?.instructions || undefined
			},
			checks: useDefaultChecks ? undefined : parsedChecks,
			judge: {
				mode: judgeMode as 'static' | 'interactive',
				guidance: guidance || undefined,
				include_reasoning: includeReasoning || undefined,
				criteria: criteria
					.filter((c) => c.id.trim() && c.title.trim())
					.map((c) => ({
						id: c.id.trim(),
						title: c.title.trim(),
						description: c.description || undefined,
						weight: Number(c.weight) || 1,
						required: c.required || undefined
					}))
			},
			timeout_s: draft.timeout_s,
			max_tokens: draft.max_tokens
		};
		if (!out.output!.files!.length) delete out.output!.files;
		if (!out.output!.mode) delete out.output!.mode;
		return out;
	}

	async function save() {
		const file = assemble();
		if (!file) return;
		busy = 'save';
		try {
			const lib = await benchy.api.saveTest(originalId ?? file.id, file, prompt);
			benchy.setLibrary(lib);
			selected = file.id;
			originalId = file.id;
			const saved = lib.tests.find((t) => t.id === file.id);
			if (saved) load(saved.file, saved.prompt);
			toasts.push(
				saved?.resolved ? 'ok' : 'warn',
				saved?.resolved ? 'Test saved' : 'Saved, but invalid',
				saved?.resolved
					? `rubric ${saved.hashes?.rubric_hash}`
					: lib.issues.find((i) => i.file.includes(file.id))?.message
			);
		} catch (e) {
			toasts.error(e, 'Could not save');
		} finally {
			busy = null;
		}
	}

	async function remove() {
		if (!originalId || !confirm(`Delete test ${originalId}? Results keep their snapshot.`)) return;
		try {
			benchy.setLibrary(await benchy.api.deleteTest(originalId));
			selected = null;
			draft = null;
			dirty = false;
		} catch (e) {
			toasts.error(e);
		}
	}

	async function suggest() {
		const file = assemble();
		if (!file) return;
		busy = 'suggest';
		try {
			suggestion = await benchy.api.suggestCriteria(file, prompt);
		} catch (e) {
			toasts.error(e, 'Suggestion failed');
		} finally {
			busy = null;
		}
	}

	function applySuggestion(mode: 'replace' | 'append') {
		if (!suggestion) return;
		const next = suggestion.criteria.map((c) => ({ ...c }));
		criteria =
			mode === 'replace'
				? next
				: [...criteria, ...next.filter((c) => !criteria.some((x) => x.id === c.id))];
		if (mode === 'replace') {
			judgeMode = suggestion.judge_mode;
			guidance = suggestion.guidance;
		}
		suggestion = null;
		dirty = true;
	}

	function move(i: number, d: number) {
		const j = i + d;
		if (j < 0 || j >= criteria.length) return;
		const copy = [...criteria];
		[copy[i], copy[j]] = [copy[j], copy[i]];
		criteria = copy;
		dirty = true;
	}
</script>

<Split width={290}>
	{#snippet side()}
		<div class="side-head">
			<input class="input" placeholder="Filter tests…" bind:value={filter} />
			{#if benchy.live}<Button
					icon="plus"
					size="sm"
					variant="primary"
					title="New test"
					onclick={newTest}
				/>{/if}
		</div>
		{#each visible as t (t.id)}
			<ListItem active={selected === t.id} onclick={() => select(t.id)}>
				<div class="row">
					<b class="ellipsis grow">{t.file.title}</b>{#if !t.resolved}<span class="bad"
							><Icon name="alert" size={14} /></span
						>{/if}
				</div>
				<div class="row meta">
					<span class="mono">{t.id}</span>
					<span class="spacer"></span>
					<span>{t.resolved?.judge.criteria.length ?? 0} crit · {t.resolved?.judge.mode ?? ''}</span
					>
				</div>
			</ListItem>
		{:else}
			<Empty icon="flask" title="No tests" />
		{/each}
	{/snippet}
	{#snippet main()}
		{#if !draft}
			<Empty icon="flask" title="Select a test"
				>A test is a prompt, the files you expect back, automated checks and the criteria the judge
				scores.</Empty
			>
		{:else}
			<div class="head">
				<div class="grow">
					<div class="row">
						<h2 class="ellipsis">{draft.title}</h2>
						{#if dirty}<span class="dirty">unsaved</span>{/if}
					</div>
					<div class="row meta">
						<span class="mono">{draft.id}</span>{#if entry?.hashes}<span>·</span><span class="mono"
								>task {entry.hashes.task_hash}</span
							><span>·</span><span class="mono">rubric {entry.hashes.rubric_hash}</span>{/if}
					</div>
				</div>
				{#if board.length}
					<div class="top">
						{#each board.slice(0, 3) as r (r.key)}<div class="row small">
								<span class="ellipsis tb">{r.label}</span><Score
									value={r.overall.mean}
									width={50}
								/>
							</div>{/each}
					</div>
				{/if}
				{#if benchy.live}
					<div class="row">
						<Button
							size="sm"
							variant="ghost"
							icon="play"
							title="Run this test"
							disabled={!entry?.resolved}
							onclick={() => wm.open('launcher', { tests: [draft!.id] })}
						/>
						{#if originalId}<Button
								size="sm"
								variant="danger"
								icon="trash"
								title="Delete"
								onclick={remove}
							/>{/if}
						<Button
							variant="primary"
							icon="save"
							loading={busy === 'save'}
							disabled={!dirty}
							onclick={save}>Save</Button
						>
					</div>
				{/if}
			</div>
			{#if issues.length}
				<div class="issues">
					{#each issues as i (i.message)}<div>
							<Icon name="alert" size={14} />
							{i.message}
						</div>{/each}
				</div>
			{/if}
			<Tabs
				bind:active={tab}
				tabs={[
					{ id: 'prompt', label: 'Prompt' },
					{ id: 'output', label: 'Output' },
					{ id: 'checks', label: 'Checks', count: useDefaultChecks ? 'auto' : checks.length },
					{ id: 'judge', label: 'Judge criteria', count: criteria.length }
				]}
			/>
			<div class="form scroll" oninput={() => (dirty = true)} onchange={() => (dirty = true)}>
				<fieldset disabled={readonly}>
					{#if tab === 'prompt'}
						<div class="grid2">
							<div>
								<label class="label" for="t-id">Id</label><input
									id="t-id"
									class="input mono"
									bind:value={draft.id}
								/>
							</div>
							<div>
								<label class="label" for="t-title">Title</label><input
									id="t-title"
									class="input"
									bind:value={draft.title}
								/>
							</div>
						</div>
						<label class="label" for="t-desc">Description</label>
						<input id="t-desc" class="input" bind:value={draft.description} />
						<label class="label" for="t-tags">Tags</label>
						<input id="t-tags" class="input" bind:value={tagsText} />
						<div class="row prompt-head">
							<span class="label" style="margin:0">Prompt (sent as the user message)</span>
							<span class="spacer"></span>
							<Segmented
								options={[
									{ id: 'edit', label: 'Edit' },
									{ id: 'preview', label: 'Preview' }
								]}
								bind:value={promptView}
							/>
						</div>
						{#if promptView === 'edit'}
							<textarea class="textarea prompt" rows="16" bind:value={prompt}></textarea>
						{:else}
							<div class="card"><Markdown source={prompt} /></div>
						{/if}
						<label class="label" for="t-sys">Test system text (optional)</label>
						<textarea id="t-sys" class="textarea" rows="3" bind:value={draft.system}></textarea>
						<div class="grid2">
							<div>
								<label class="label" for="t-mt">max_tokens (optional)</label><input
									id="t-mt"
									class="input"
									type="number"
									bind:value={draft.max_tokens}
								/>
							</div>
							<div>
								<label class="label" for="t-to">Timeout s (optional)</label><input
									id="t-to"
									class="input"
									type="number"
									bind:value={draft.timeout_s}
								/>
							</div>
						</div>
					{:else if tab === 'output'}
						<label class="label" for="t-mode">Output mode</label>
						<select
							id="t-mode"
							class="select"
							value={draft.output?.mode ?? ''}
							onchange={(e) =>
								(draft!.output = {
									...draft!.output,
									mode: ((e.target as HTMLSelectElement).value || undefined) as never
								})}
						>
							<option value="">auto (single file → single, several → files, none → text)</option>
							<option value="single"
								>single — one file, from the whole response or its best code block</option
							>
							<option value="files">files — several fenced blocks tagged with a path</option>
							<option value="text">text — the response itself (Markdown / prose)</option>
							<option value="workspace">workspace — agentic subjects write files</option>
						</select>
						<h4 class="section-title">Expected files</h4>
						<div class="files">
							{#each files as f, i (i)}
								<input class="input mono" bind:value={f.path} placeholder="index.html" />
								<input
									class="input"
									bind:value={f.kind}
									placeholder="kind (auto)"
									list="kinds-list"
								/>
								<input
									class="input"
									bind:value={f.description}
									placeholder="description for the model (optional)"
								/>
								<label class="row small"
									><input type="checkbox" bind:checked={f.required} /> required</label
								>
								<button
									class="rm"
									type="button"
									onclick={() => {
										files = files.filter((_, j) => j !== i);
										dirty = true;
									}}><Icon name="close" size={13} /></button
								>
							{/each}
						</div>
						<datalist id="kinds-list"
							>{#each ['html', 'svg', 'markdown', 'model3d', 'program', 'json', 'code', 'text'] as k (k)}<option
									value={k}
								></option>{/each}</datalist
						>
						<Button
							size="sm"
							icon="plus"
							onclick={() => {
								files = [...files, { path: '', kind: '', required: true, description: '' }];
								dirty = true;
							}}>Add file</Button
						>
						<label class="label" for="t-instr">Custom output instructions (replaces Benchy's)</label
						>
						<textarea
							id="t-instr"
							class="textarea"
							rows="3"
							value={draft.output?.instructions ?? ''}
							oninput={(e) =>
								(draft!.output = {
									...draft!.output,
									instructions: (e.target as HTMLTextAreaElement).value || undefined
								})}
							placeholder="Leave empty: Benchy asks for exactly one fenced block per file."
						></textarea>
					{:else if tab === 'checks'}
						<Toggle
							bind:checked={useDefaultChecks}
							label="Use the default checks of each file's kind"
						/>
						{#if !useDefaultChecks}
							<p class="hint">
								Options are JSON. <code>html.render</code>: screenshots, viewport, interactions.
								<code>program.run</code>: cases with args, stdin and expectations.
								<code>text.stats</code>: min_words, max_words.
							</p>
							{#each checks as c, i (i)}
								<div class="check-row card">
									<div class="row">
										<select class="select" style="max-width:220px" bind:value={c.id}>
											{#each checkIds as id (id)}<option value={id}>{id}</option>{/each}
										</select>
										<span class="muted small grow"
											>{benchy.library?.checks.find((x) => x.id === c.id)?.description}</span
										>
										<button
											class="rm"
											type="button"
											onclick={() => {
												checks = checks.filter((_, j) => j !== i);
												dirty = true;
											}}><Icon name="close" size={13} /></button
										>
									</div>
									<textarea
										class="textarea"
										rows={Math.min(14, Math.max(2, c.options.split('\n').length))}
										bind:value={c.options}
										placeholder={'{}'}></textarea>
								</div>
							{/each}
							{#if checkError}<p class="err">{checkError}</p>{/if}
							<Button
								size="sm"
								icon="plus"
								onclick={() => {
									checks = [...checks, { id: checkIds[1] ?? 'html.parse', options: '' }];
									dirty = true;
								}}>Add check</Button
							>
						{:else}
							<p class="hint">
								Resolved defaults: {entry?.resolved?.checks.map((c) => c.id).join(', ') || '—'}
							</p>
						{/if}
					{:else if tab === 'judge'}
						<div class="row wrap">
							<div>
								<span class="label">Judge depth</span>
								<Segmented
									options={[
										{ id: 'static', label: 'Static — code, screenshots, logs' },
										{ id: 'interactive', label: 'Interactive — uses it in a browser / runs it' }
									]}
									bind:value={judgeMode}
								/>
							</div>
							<span class="spacer"></span>
							<Toggle bind:checked={includeReasoning} label="Show reasoning to the judge" />
						</div>
						<label class="label" for="t-guid">Guidance for the judge</label>
						<textarea
							id="t-guid"
							class="textarea"
							rows="3"
							bind:value={guidance}
							placeholder="Pitfalls to check, what to try, how strict to be…"></textarea>
						<div class="row crit-head">
							<h4 class="section-title" style="margin:0">Criteria</h4>
							<span class="muted small"
								>total weight {totalWeight} · required criteria below 5/10 fail the gate</span
							>
							<span class="spacer"></span>
							{#if benchy.live}<Button
									size="sm"
									icon="sparkle"
									loading={busy === 'suggest'}
									onclick={suggest}>Suggest with Claude</Button
								>{/if}
						</div>
						{#if busy === 'suggest'}<p class="hint">
								Claude is reading the prompt and drafting a rubric — this takes a minute or two.
							</p>{/if}
						{#if suggestion}
							<div class="card suggestion">
								<div class="row">
									<b><Icon name="sparkle" size={15} /> Suggested rubric</b><span class="muted small"
										>{suggestion.criteria.length} criteria · {suggestion.judge_mode}</span
									><span class="spacer"></span><Button
										size="sm"
										onclick={() => applySuggestion('append')}>Append new</Button
									><Button size="sm" variant="primary" onclick={() => applySuggestion('replace')}
										>Replace</Button
									><Button
										size="sm"
										variant="ghost"
										icon="close"
										onclick={() => (suggestion = null)}
									/>
								</div>
								<p class="small muted">{suggestion.guidance}</p>
								<ul>
									{#each suggestion.criteria as c (c.id)}<li>
											<b>{c.title}</b>
											<span class="mono muted"
												>{c.id} ×{c.weight}{c.required ? ' required' : ''}</span
											><br /><span class="small">{c.description}</span>
										</li>{/each}
								</ul>
							</div>
						{/if}
						{#each criteria as c, i (i)}
							<div class="card crit" style="animation-delay:{i * 30}ms">
								<div class="crit-grid">
									<input class="input mono" bind:value={c.id} placeholder="criterion-id" />
									<input class="input" bind:value={c.title} placeholder="Title" />
									<div class="weight">
										{#each [1, 2, 3] as w (w)}<button
												type="button"
												class:on={Number(c.weight) === w}
												onclick={() => {
													c.weight = w;
													dirty = true;
												}}>×{w}</button
											>{/each}
									</div>
									<Toggle bind:checked={c.required} label="required" />
									<div class="order">
										<button type="button" title="Up" onclick={() => move(i, -1)}>▲</button>
										<button type="button" title="Down" onclick={() => move(i, 1)}>▼</button>
										<button
											type="button"
											title="Remove"
											class="del"
											onclick={() => {
												criteria = criteria.filter((_, j) => j !== i);
												dirty = true;
											}}>✕</button
										>
									</div>
								</div>
								<textarea
									class="textarea desc"
									rows="2"
									bind:value={c.description}
									placeholder="What earns a high score — observable by the judge."></textarea>
								<div class="wbar">
									<span style="width:{totalWeight ? (Number(c.weight) / totalWeight) * 100 : 0}%"
									></span>
								</div>
							</div>
						{/each}
						<Button
							size="sm"
							icon="plus"
							onclick={() => {
								criteria = [
									...criteria,
									{ id: '', title: '', description: '', weight: 1, required: false }
								];
								dirty = true;
							}}>Add criterion</Button
						>
						{#if !criteria.length}<p class="hint">
								Without criteria the judge uses two defaults: “Fulfils the task” (×3, required) and
								“Overall quality” (×2).
							</p>{/if}
					{/if}
				</fieldset>
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
		gap: 6px;
		padding: 10px;
		background: var(--bg-2);
		border-bottom: 1px solid var(--line-soft);
	}
	.meta {
		font-size: 11.5px;
		color: var(--text-3);
		gap: 6px;
	}
	.bad {
		color: var(--bad);
		--icon-accent: var(--bad);
	}
	.head {
		display: flex;
		gap: 14px;
		align-items: center;
		padding: 12px 16px;
		border-bottom: 1px solid var(--line-soft);
	}
	h2 {
		margin: 0;
		font-size: 16px;
	}
	.dirty {
		font-size: 11px;
		color: var(--yellow-2);
		border: 1px solid var(--yellow-a35);
		padding: 0 6px;
		border-radius: 5px;
	}
	.top {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.tb {
		max-width: 150px;
		color: var(--text-3);
	}
	.small {
		font-size: 12px;
	}
	.issues {
		padding: 8px 16px;
		background: rgba(255, 93, 115, 0.08);
		border-bottom: 1px solid rgba(255, 93, 115, 0.3);
		color: #ffb3bd;
		font-size: 12.5px;
	}
	.form {
		flex: 1;
		padding: 14px 16px 24px;
	}
	fieldset {
		border: 0;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
		max-width: 940px;
	}
	fieldset .label {
		margin-top: 8px;
	}
	.grid2 {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0 12px;
	}
	.prompt-head {
		margin-top: 12px;
	}
	.textarea.prompt {
		font-size: 13px;
		min-height: 280px;
	}
	.files {
		display: grid;
		grid-template-columns: 1.2fr 0.8fr 2fr auto 30px;
		gap: 5px;
		align-items: center;
	}
	.files .input {
		padding: 5px 8px;
		font-size: 12.5px;
	}
	.rm {
		display: grid;
		place-items: center;
		height: 28px;
		width: 28px;
		border: 1px solid var(--line-soft);
		border-radius: 6px;
		background: transparent;
		color: var(--text-3);
		cursor: pointer;
	}
	.rm:hover {
		color: var(--bad);
		border-color: var(--bad);
	}
	.check-row {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.err {
		color: var(--bad);
		font-size: 12.5px;
	}
	.crit-head {
		margin-top: 16px;
	}
	.suggestion {
		border-color: var(--yellow-a35);
		box-shadow: var(--glow-soft);
		animation: fade-up 0.25s both;
	}
	.suggestion ul {
		margin: 6px 0 0;
		padding-left: 18px;
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-size: 13px;
	}
	.crit {
		display: flex;
		flex-direction: column;
		gap: 6px;
		animation: fade-up 0.25s both;
	}
	.crit-grid {
		display: grid;
		grid-template-columns: 180px 1fr auto auto auto;
		gap: 8px;
		align-items: center;
	}
	.crit-grid .input {
		padding: 5px 8px;
	}
	.weight {
		display: inline-flex;
		border: 1px solid var(--line);
		border-radius: 7px;
		overflow: hidden;
	}
	.weight button {
		height: 28px;
		padding: 0 9px;
		border: 0;
		background: transparent;
		color: var(--text-3);
		cursor: pointer;
		font-size: 12px;
	}
	.weight button.on {
		background: var(--yellow-a20);
		color: var(--yellow-2);
	}
	.order {
		display: flex;
		gap: 2px;
	}
	.order button {
		width: 24px;
		height: 24px;
		border: 1px solid var(--line-soft);
		border-radius: 5px;
		background: transparent;
		color: var(--text-3);
		cursor: pointer;
		font-size: 10px;
	}
	.order button:hover {
		color: var(--text);
		border-color: var(--line-strong);
	}
	.order .del:hover {
		color: var(--bad);
		border-color: var(--bad);
	}
	.textarea.desc {
		min-height: 48px;
		font-family: var(--font);
		font-size: 13px;
	}
	.wbar {
		height: 3px;
		background: var(--bg-1);
		border-radius: 3px;
		overflow: hidden;
	}
	.wbar span {
		display: block;
		height: 100%;
		background: var(--yellow);
		box-shadow: 0 0 8px var(--yellow);
		transition: width 0.3s var(--ease-out);
	}
	code {
		font-size: 11.5px;
		color: var(--yellow-2);
	}
</style>
