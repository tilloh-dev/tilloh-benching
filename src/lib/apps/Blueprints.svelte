<script lang="ts">
	import type { BlueprintFile, Scalar } from '$engine/core/schema.ts';
	import type { Win } from '../os/wm.svelte.ts';
	import { wm } from '../os/wm.svelte.ts';
	import { benchy } from '../data/store.svelte.ts';
	import { toasts } from '../os/toasts.svelte.ts';
	import Split from '../ui/Split.svelte';
	import ListItem from '../ui/ListItem.svelte';
	import Button from '../ui/Button.svelte';
	import Kind from '../ui/Kind.svelte';
	import Empty from '../ui/Empty.svelte';
	import Tabs from '../ui/Tabs.svelte';
	import JsonTree from '../ui/JsonTree.svelte';
	import Score from '../ui/Score.svelte';
	import Menu from '../os/Menu.svelte';
	import Icon from '../os/Icon.svelte';
	import { leaderboard } from '$engine/core/rows.ts';

	let { win: _win, props }: { win: Win; props: Record<string, unknown> } = $props();

	const KINDS = ['llama-cpp', 'openai-compatible', 'claude-code', 'dry-run'] as const;
	const TEMPLATES: Record<string, Partial<BlueprintFile>> = {
		'llama-cpp': {
			kind: 'llama-cpp',
			tags: ['local'],
			server: {
				model: 'Model-Dir/model-Q4_K_M.gguf',
				'ctx-size': 65536,
				'n-gpu-layers': -1,
				'flash-attn': 'on',
				'cache-type-k': 'q8_0',
				'cache-type-v': 'q8_0',
				jinja: true,
				'reasoning-format': 'auto',
				temp: 0.7
			},
			request: { max_tokens: 32000 }
		},
		'openai-compatible': {
			kind: 'openai-compatible',
			tags: ['remote'],
			endpoint: {
				base_url: 'https://openrouter.ai/api/v1',
				model: 'qwen/qwen3.8-27b',
				api_key_env: 'OPENROUTER_API_KEY'
			},
			request: { temperature: 0.7, max_tokens: 32000 }
		},
		'claude-code': {
			kind: 'claude-code',
			tags: ['remote', 'claude'],
			claude: { model: 'claude-sonnet-5-5', effort: 'high', mode: 'chat' }
		},
		'dry-run': { kind: 'dry-run', tags: ['test'], dry_run: { profile: 'mixed' } }
	};
	const LLAMA_KEYS = [
		'model',
		'mmproj',
		'model-draft',
		'ctx-size',
		'n-gpu-layers',
		'n-cpu-moe',
		'device',
		'flash-attn',
		'cache-type-k',
		'cache-type-v',
		'cache-type-k-draft',
		'cache-type-v-draft',
		'jinja',
		'reasoning',
		'reasoning-format',
		'reasoning-effort',
		'reasoning-budget',
		'chat-template-file',
		'parallel',
		'kv-unified',
		'fit',
		'spec-type',
		'spec-draft-n-max',
		'temp',
		'top-p',
		'top-k',
		'min-p',
		'presence-penalty',
		'repeat-penalty',
		'cache-ram',
		'load-mode',
		'threads',
		'batch-size',
		'ubatch-size'
	];

	let selected = $state<string | null>(null);
	let draft = $state<BlueprintFile | null>(null);
	let originalId = $state<string | null>(null);
	let serverRows = $state<{ k: string; v: string }[]>([]);
	let requestText = $state('{}');
	let requestError = $state<string | null>(null);
	let tagsText = $state('');
	let dirty = $state(false);
	let tab = $state('edit');
	let filter = $state('');
	let busy = $state<string | null>(null);
	let importOpen = $state(false);
	let importPath = $state('~/tooling/llama.cpp/presets/models.ini');
	let importOverwrite = $state(false);

	const entries = $derived(benchy.library?.blueprints ?? []);
	const visible = $derived(
		entries.filter(
			(b) =>
				!filter ||
				`${b.id} ${b.file.label ?? ''} ${(b.file.tags ?? []).join(' ')}`
					.toLowerCase()
					.includes(filter.toLowerCase())
		)
	);
	const entry = $derived(entries.find((b) => b.id === selected));
	const issues = $derived(
		(benchy.library?.issues ?? []).filter(
			(i) => selected && i.file === `blueprints/${selected}.yaml`
		)
	);
	const kind = $derived(draft?.kind ?? entry?.resolved?.kind ?? null);
	const readonly = $derived(!benchy.live);
	const stats = $derived(
		selected
			? leaderboard(benchy.attempts.filter((a) => a.blueprint_id === selected)).rows[0]
			: undefined
	);

	$effect(() => {
		const want = props.select as string | undefined;
		if (want && want !== selected) select(want);
	});
	$effect(() => {
		if (!selected && entries.length) select(entries[0].id);
	});

	function toStr(v: Scalar): string {
		return typeof v === 'string' ? v : String(v);
	}
	function fromStr(v: string): Scalar {
		const t = v.trim();
		if (t === 'true') return true;
		if (t === 'false') return false;
		if (/^-?\d+(\.\d+)?$/.test(t) && t.length < 16) return Number(t);
		return t;
	}

	function load(file: BlueprintFile) {
		draft = structuredClone($state.snapshot(file)) as BlueprintFile;
		serverRows = Object.entries(file.server ?? {}).map(([k, v]) => ({ k, v: toStr(v) }));
		requestText = JSON.stringify(file.request ?? {}, null, 2);
		tagsText = (file.tags ?? []).join(', ');
		requestError = null;
		dirty = false;
	}

	function select(id: string) {
		if (dirty && !confirm('Discard unsaved changes?')) return;
		const e = entries.find((b) => b.id === id);
		selected = id;
		originalId = id;
		if (e) load(e.file);
	}

	function newBlueprint(k: string) {
		if (dirty && !confirm('Discard unsaved changes?')) return;
		const base = TEMPLATES[k];
		const id = `new-${k}-${Math.random().toString(36).slice(2, 6)}`;
		selected = null;
		originalId = null;
		load({ id, label: `New ${k} blueprint`, ...structuredClone(base) } as BlueprintFile);
		dirty = true;
		tab = 'edit';
	}

	function duplicate(derive: boolean) {
		if (!draft) return;
		const src = draft;
		const id = `${src.id}-${derive ? 'variant' : 'copy'}`;
		const next: BlueprintFile = derive
			? { id, extends: src.id, label: `${src.label ?? src.id} (variant)` }
			: { ...structuredClone($state.snapshot(src)), id, label: `${src.label ?? src.id} (copy)` };
		selected = null;
		originalId = null;
		load(next);
		dirty = true;
	}

	function assemble(): BlueprintFile | null {
		if (!draft) return null;
		let request: Record<string, unknown>;
		try {
			request = requestText.trim() ? JSON.parse(requestText) : {};
			requestError = null;
		} catch (e) {
			requestError = (e as Error).message;
			return null;
		}
		const server = Object.fromEntries(
			serverRows.filter((r) => r.k.trim()).map((r) => [r.k.trim(), fromStr(r.v)])
		);
		const tags = tagsText
			.split(',')
			.map((t) => t.trim())
			.filter(Boolean);
		const out: BlueprintFile = { ...$state.snapshot(draft) } as BlueprintFile;
		out.tags = tags.length ? tags : undefined;
		out.request = Object.keys(request).length ? request : undefined;
		out.server =
			draft.kind === 'llama-cpp' || Object.keys(server).length
				? Object.keys(server).length
					? server
					: undefined
				: undefined;
		for (const k of Object.keys(out) as (keyof BlueprintFile)[])
			if (out[k] === '' || out[k] === undefined) delete out[k];
		return out;
	}

	async function save() {
		const file = assemble();
		if (!file) return;
		busy = 'save';
		try {
			const lib = await benchy.api.saveBlueprint(originalId ?? file.id, file);
			benchy.setLibrary(lib);
			selected = file.id;
			originalId = file.id;
			dirty = false;
			const saved = lib.blueprints.find((b) => b.id === file.id);
			if (saved) load(saved.file);
			toasts.push(
				saved?.resolved ? 'ok' : 'warn',
				saved?.resolved ? 'Blueprint saved' : 'Saved, but invalid',
				saved?.resolved
					? `version ${saved.hash}`
					: lib.issues.find((i) => i.file.includes(file.id))?.message
			);
		} catch (e) {
			toasts.error(e, 'Could not save');
		} finally {
			busy = null;
		}
	}

	async function remove() {
		if (
			!originalId ||
			!confirm(`Delete blueprint ${originalId}? Results that used it keep their snapshot.`)
		)
			return;
		try {
			benchy.setLibrary(await benchy.api.deleteBlueprint(originalId));
			selected = null;
			draft = null;
			dirty = false;
		} catch (e) {
			toasts.error(e);
		}
	}

	async function doImport() {
		busy = 'import';
		try {
			const r = await benchy.api.importPreset({ path: importPath, overwrite: importOverwrite });
			benchy.setLibrary(r.library);
			toasts.push(
				'ok',
				`Imported ${r.created.length} blueprint(s)`,
				r.skipped.length ? `${r.skipped.length} already existed` : undefined
			);
			importOpen = false;
		} catch (e) {
			toasts.error(e, 'Import failed');
		} finally {
			busy = null;
		}
	}

	function touch() {
		dirty = true;
	}

	type Part = 'endpoint' | 'claude' | 'dry_run';
	const DEFAULT_PARTS = {
		endpoint: { base_url: '', model: '' },
		claude: { model: 'claude-sonnet-5-5', mode: 'chat' as const },
		dry_run: { profile: 'mixed' as const }
	};

	/** A kind-specific block the child does not define: inherit it, or copy it in to override. */
	function override(part: Part) {
		if (!draft) return;
		const parent = draft.extends
			? entries.find((b) => b.id === draft!.extends)?.resolved
			: undefined;
		const value = structuredClone($state.snapshot(parent?.[part] ?? DEFAULT_PARTS[part]));
		(draft as Record<Part, unknown>)[part] = value;
		touch();
	}

	const newItems = KINDS.map((k) => ({
		label: k,
		icon:
			k === 'llama-cpp'
				? 'chip'
				: k === 'claude-code'
					? 'sparkle'
					: k === 'dry-run'
						? 'flask'
						: 'external',
		action: () => newBlueprint(k)
	}));
</script>

{#snippet inherited(part: Part)}
	<div class="inherit">
		{#if draft?.extends}
			<span class="muted">Inherited from <b>{draft.extends}</b>.</span>
		{:else}
			<span class="muted">Not configured yet.</span>
		{/if}
		{#if !readonly}<Button size="sm" icon="edit" onclick={() => override(part)}
				>{draft?.extends ? 'Override' : 'Configure'}</Button
			>{/if}
	</div>
{/snippet}

<Split width={290}>
	{#snippet side()}
		<div class="side-head">
			<input class="input" placeholder="Filter blueprints…" bind:value={filter} />
			{#if benchy.live}
				<Menu
					items={[
						...newItems,
						'sep',
						{ label: 'Import router preset…', icon: 'upload', action: () => (importOpen = true) }
					]}
					align="right"
				>
					{#snippet trigger()}<Icon name="plus" size={12} />{/snippet}
				</Menu>
			{/if}
		</div>
		{#each visible as b (b.id)}
			<ListItem active={selected === b.id} onclick={() => select(b.id)}>
				<div class="row">
					<b class="ellipsis grow">{b.file.label ?? b.id}</b>
					{#if !b.resolved}<span class="bad" title="invalid"><Icon name="alert" size={12} /></span
						>{/if}
				</div>
				<div class="row meta">
					<Kind kind={b.resolved?.kind ?? b.file.kind ?? '?'} />
					{#if b.file.extends}<span class="ext">↳ {b.file.extends}</span>{/if}
					<span class="spacer"></span>
					<span class="mono hash">{b.hash?.slice(0, 7) ?? ''}</span>
				</div>
			</ListItem>
		{:else}
			<Empty icon="blueprint" title="No blueprints"
				>{#if benchy.live}Create one with + or import your llama.cpp router preset.{/if}</Empty
			>
		{/each}
	{/snippet}
	{#snippet main()}
		{#if importOpen}
			<div class="dialog card">
				<h3><Icon name="upload" size={12} /> Import router preset</h3>
				<p class="muted">
					Every <code>[section]</code> of a llama-server <code>--models-preset</code> INI becomes a
					llama-cpp blueprint. <code>/home/USER</code> placeholders are replaced with your home directory.
				</p>
				<label class="label" for="imp-path">Path on this host</label>
				<input id="imp-path" class="input mono" bind:value={importPath} />
				<label class="row small"
					><input type="checkbox" bind:checked={importOverwrite} /> overwrite existing blueprints</label
				>
				<div class="row">
					<span class="spacer"></span>
					<Button variant="ghost" onclick={() => (importOpen = false)}>Cancel</Button>
					<Button variant="primary" icon="upload" loading={busy === 'import'} onclick={doImport}
						>Import</Button
					>
				</div>
			</div>
		{/if}
		{#if !draft}
			<Empty icon="blueprint" title="Select a blueprint"
				>A blueprint is a model plus every setting that matters for a benchmark.</Empty
			>
		{:else}
			<div class="head">
				<div class="grow">
					<div class="row">
						<h2 class="ellipsis">{draft.label || draft.id}</h2>
						{#if kind}<Kind {kind} />{/if}{#if dirty}<span class="dirty">unsaved</span>{/if}
					</div>
					<div class="row meta">
						<span class="mono">{draft.id}</span>{#if entry?.hash}<span>·</span><span class="mono"
								>version {entry.hash}</span
							>{/if}{#if draft.origin?.reconstructed}<span class="warn">reconstructed</span>{/if}
					</div>
				</div>
				{#if stats}
					<div class="bp-stats">
						<Score value={stats.overall.mean} width={90} /><span class="muted small"
							>{stats.attempts} attempts · {Object.keys(stats.per_test).length} tests</span
						>
					</div>
				{/if}
				{#if benchy.live}
					<div class="row">
						<Button
							size="sm"
							variant="ghost"
							icon="copy"
							title="Duplicate"
							onclick={() => duplicate(false)}
						/>
						<Button
							size="sm"
							variant="ghost"
							icon="layers"
							title="Derive a variant (extends)"
							onclick={() => duplicate(true)}
						/>
						<Button
							size="sm"
							variant="ghost"
							icon="play"
							title="Run this blueprint"
							disabled={!entry?.resolved}
							onclick={() => wm.open('launcher', { blueprints: [draft!.id] })}
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
							<Icon name="alert" size={12} />
							{i.message}
						</div>{/each}
				</div>
			{/if}
			<Tabs
				bind:active={tab}
				tabs={[
					{ id: 'edit', label: 'Settings' },
					{ id: 'resolved', label: 'Resolved', disabled: !entry?.resolved }
				]}
			/>
			<div class="form scroll" oninput={touch} onchange={touch}>
				{#if tab === 'edit'}
					<fieldset disabled={readonly}>
						<div class="grid2">
							<div>
								<label class="label" for="bp-id">Id</label><input
									id="bp-id"
									class="input mono"
									bind:value={draft.id}
								/>
							</div>
							<div>
								<label class="label" for="bp-label">Label</label><input
									id="bp-label"
									class="input"
									bind:value={draft.label}
								/>
							</div>
							<div>
								<label class="label" for="bp-kind">Kind</label>
								<select id="bp-kind" class="select" bind:value={draft.kind}>
									{#if draft.extends}<option value={undefined}>(inherit)</option>{/if}
									{#each KINDS as k (k)}<option value={k}>{k}</option>{/each}
								</select>
							</div>
							<div>
								<label class="label" for="bp-ext">Extends</label>
								<select id="bp-ext" class="select" bind:value={draft.extends}>
									<option value={undefined}>—</option>
									{#each entries.filter((b) => b.id !== draft?.id) as b (b.id)}<option value={b.id}
											>{b.id}</option
										>{/each}
								</select>
							</div>
						</div>
						<label class="label" for="bp-desc">Description</label>
						<input
							id="bp-desc"
							class="input"
							bind:value={draft.description}
							placeholder="What makes this configuration different"
						/>
						<label class="label" for="bp-tags">Tags</label>
						<input
							id="bp-tags"
							class="input"
							bind:value={tagsText}
							placeholder="local, qwen, effort-high"
						/>

						{#if kind === 'llama-cpp'}
							<h4 class="section-title">
								llama-server flags <span class="muted">(router preset keys, without “--”)</span>
							</h4>
							<p class="hint">
								Relative model paths resolve against <code>llama.models_dir</code> in benchy.local.yaml
								— that keeps one blueprint valid on hermine and Gertrude.
							</p>
							<datalist id="llama-keys"
								>{#each LLAMA_KEYS as k (k)}<option value={k}></option>{/each}</datalist
							>
							<div class="kv-table">
								{#each serverRows as r, i (i)}
									<input class="input mono" list="llama-keys" bind:value={r.k} placeholder="flag" />
									<input class="input mono" bind:value={r.v} placeholder="value" />
									<button
										class="rm"
										type="button"
										title="Remove"
										onclick={() => {
											serverRows = serverRows.filter((_, j) => j !== i);
											touch();
										}}><Icon name="close" size={12} /></button
									>
								{/each}
							</div>
							<Button
								size="sm"
								icon="plus"
								onclick={() => {
									serverRows = [...serverRows, { k: '', v: '' }];
									touch();
								}}>Add flag</Button
							>
						{:else if kind === 'openai-compatible'}
							<h4 class="section-title">Endpoint</h4>
							{#if !draft.endpoint}
								{@render inherited('endpoint')}
							{:else}
								<div class="grid2">
									<div>
										<label class="label" for="ep-url">Base URL</label><input
											id="ep-url"
											class="input mono"
											bind:value={draft.endpoint.base_url}
											placeholder="https://openrouter.ai/api/v1"
										/>
									</div>
									<div>
										<label class="label" for="ep-model">Model</label><input
											id="ep-model"
											class="input mono"
											bind:value={draft.endpoint.model}
										/>
									</div>
									<div>
										<label class="label" for="ep-key">API key variable (.env)</label><input
											id="ep-key"
											class="input mono"
											bind:value={draft.endpoint.api_key_env}
											placeholder="OPENROUTER_API_KEY"
										/>
									</div>
								</div>
							{/if}
							<p class="hint">
								OpenRouter, Ollama Cloud (<code>https://ollama.com/v1</code>), OpenAI, vLLM, LM
								Studio — anything that speaks <code>/chat/completions</code>. Keys stay in .env;
								only the variable name is stored.
							</p>
						{:else if kind === 'claude-code'}
							<h4 class="section-title">Claude Code (claude -p)</h4>
							{#if !draft.claude}
								{@render inherited('claude')}
							{:else}
								<div class="grid2">
									<div>
										<label class="label" for="cc-model">Model</label><input
											id="cc-model"
											class="input mono"
											list="cc-models"
											bind:value={draft.claude.model}
										/><datalist id="cc-models"
											><option value="claude-opus-5-5"></option><option value="claude-sonnet-5-5"
											></option><option value="claude-fable-5-1"></option><option value="haiku"
											></option></datalist
										>
									</div>
									<div>
										<label class="label" for="cc-effort">Effort</label>
										<select id="cc-effort" class="select" bind:value={draft.claude.effort}>
											<option value={undefined}>default</option>
											{#each ['low', 'medium', 'high', 'xhigh', 'max'] as e (e)}<option value={e}
													>{e}</option
												>{/each}
										</select>
									</div>
									<div>
										<label class="label" for="cc-mode">Mode</label>
										<select id="cc-mode" class="select" bind:value={draft.claude.mode}>
											<option value="chat"
												>chat — one answer, no tools (fair vs. local models)</option
											>
											<option value="agentic">agentic — writes files with tools in a sandbox</option
											>
										</select>
									</div>
								</div>
							{/if}
						{:else if kind === 'dry-run'}
							<h4 class="section-title">Dry run</h4>
							{#if !draft.dry_run}
								{@render inherited('dry_run')}
							{:else}
								<select class="select" bind:value={draft.dry_run.profile}>
									<option value="mixed">mixed — includes broken outputs</option>
									<option value="good">good — always valid</option>
									<option value="broken">broken — always broken</option>
								</select>
							{/if}
						{/if}

						<h4 class="section-title">Request body (JSON, merged into every chat request)</h4>
						<p class="hint">
							Sampling and reasoning per request, e.g. <code
								>{'{"temperature": 0.6, "max_tokens": 32000, "chat_template_kwargs": {"enable_thinking": true}, "reasoning": {"effort": "high"}}'}</code
							>
						</p>
						<textarea
							class="textarea"
							rows="7"
							bind:value={requestText}
							class:invalid={requestError}></textarea>
						{#if requestError}<p class="err small">{requestError}</p>{/if}

						<h4 class="section-title">System prompt</h4>
						<textarea
							class="textarea"
							rows="4"
							bind:value={draft.system_prompt}
							placeholder="Optional. Prepended to the test's own system text and BenchyOS's output instructions."
						></textarea>

						<div class="grid2">
							<div>
								<label class="label" for="bp-timeout">Timeout (s)</label><input
									id="bp-timeout"
									class="input"
									type="number"
									bind:value={draft.timeout_s}
									placeholder="default"
								/>
							</div>
							<div>
								<label class="label" for="bp-conc">Parallel requests</label><input
									id="bp-conc"
									class="input"
									type="number"
									min="1"
									bind:value={draft.concurrency}
									placeholder="default"
								/>
							</div>
						</div>
						{#if draft.origin}
							<p class="hint">
								Origin: {draft.origin.source}{draft.origin.note ? ` — ${draft.origin.note}` : ''}
							</p>
						{/if}
					</fieldset>
				{:else if entry?.resolved}
					<p class="hint">
						After <code>extends</code> resolution — exactly what a run snapshots. Version hash
						<code>{entry.hash}</code> covers everything except id, label, description, tags and origin.
					</p>
					<JsonTree value={entry.resolved} open />
				{/if}
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
		gap: var(--sp-3);
		padding: var(--sp-5);
		background: var(--surface);
		border-bottom: var(--bw) solid var(--line-soft);
	}
	.meta {
		font-size: var(--fs-s);
		color: var(--fg-3);
		gap: var(--sp-3);
	}
	.ext {
		font-size: var(--fs-xs);
		color: var(--fg-3);
	}
	.hash {
		font-size: var(--fs-xs);
		color: var(--fg-4);
	}
	.bad {
		color: var(--bad);
		--icon-accent: var(--bad);
	}
	.head {
		display: flex;
		gap: var(--sp-6);
		align-items: center;
		padding: var(--sp-5) var(--sp-6);
		border-bottom: var(--bw) solid var(--line-soft);
	}
	h2 {
		margin: 0;
		font-size: var(--fs-l);
	}
	.dirty {
		font-size: var(--fs-xs);
		padding: 0 var(--sp-3);
		color: var(--fg-2);
		border: var(--bw) solid var(--line-strong);
	}
	.warn {
		color: var(--warn);
	}
	.bp-stats {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: var(--sp-1);
	}
	.small {
		font-size: var(--fs-s);
	}
	.issues {
		padding: var(--sp-4) var(--sp-6);
		border-bottom: var(--bw) solid var(--bad);
		color: var(--bad);
		font-size: var(--fs-m);
		--icon-accent: var(--bad);
	}
	.form {
		flex: 1;
		padding: var(--sp-6) var(--sp-6) var(--sp-7);
	}
	fieldset {
		border: 0;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
		max-width: 880px;
	}
	fieldset .label {
		margin-top: var(--sp-5);
	}
	.section-title {
		margin-top: var(--sp-7);
	}
	.grid2 {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0 var(--sp-5);
	}
	.kv-table {
		display: grid;
		grid-template-columns: minmax(160px, 1fr) 2fr 30px;
		gap: var(--sp-3);
		margin: var(--sp-3) 0 var(--sp-4);
	}
	.kv-table .input {
		padding: var(--sp-3) var(--sp-4);
		font-size: var(--fs-m);
	}
	.rm {
		display: grid;
		place-items: center;
		border: var(--bw) solid var(--line-soft);
		background: transparent;
		color: var(--fg-3);
		cursor: pointer;
	}
	.rm:hover {
		color: var(--bad);
		border-color: var(--bad);
	}
	.textarea.invalid {
		border-color: var(--bad);
	}
	.err {
		color: var(--bad);
	}
	.hint code,
	p code {
		font-size: var(--fs-s);
		color: var(--fg);
	}
	.inherit {
		display: flex;
		align-items: center;
		gap: var(--sp-5);
		padding: var(--sp-5) var(--sp-5);
		border: 1px dashed var(--line);
		font-size: var(--fs-m);
	}
	.dialog {
		margin: var(--sp-5) var(--sp-6) 0;
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
		animation: appear var(--dur-3) both;
		border-color: var(--line-strong);
	}
	.dialog h3 {
		margin: 0;
		display: flex;
		gap: var(--sp-4);
		align-items: center;
		font-size: var(--fs-l);
	}
	.dialog p {
		margin: 0;
		font-size: var(--fs-m);
	}
</style>
