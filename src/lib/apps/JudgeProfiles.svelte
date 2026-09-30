<script lang="ts">
	import type { JudgeProfile } from '$engine/core/schema.ts';
	import { wm } from '../os/wm.svelte.ts';
	import { benchy } from '../data/store.svelte.ts';
	import { toasts } from '../os/toasts.svelte.ts';
	import Split from '../ui/Split.svelte';
	import ListItem from '../ui/ListItem.svelte';
	import Button from '../ui/Button.svelte';
	import Empty from '../ui/Empty.svelte';

	let selected = $state<string | null>(null);
	let originalId = $state<string | null>(null);
	let draft = $state<JudgeProfile | null>(null);
	let requestJson = $state('');
	let dirty = $state(false);
	let busy = $state(false);

	const judges = $derived(benchy.library?.judges ?? []);
	const entry = $derived(judges.find((j) => j.profile.id === selected) ?? null);

	$effect(() => {
		if (!selected && !draft && judges.length) pick(judges[0].profile.id);
	});

	// Switching the kind to an API judge needs an endpoint to bind the fields to.
	$effect(() => {
		if (draft?.kind === 'openai-compatible' && !draft.endpoint) draft.endpoint = { base_url: '' };
	});

	function pick(id: string) {
		const j = judges.find((x) => x.profile.id === id);
		if (!j) return;
		selected = id;
		originalId = id;
		draft = structuredClone($state.snapshot(j.profile)) as JudgeProfile;
		requestJson = draft.request ? JSON.stringify(draft.request, null, 2) : '';
		dirty = false;
	}

	function fresh(kind: JudgeProfile['kind']) {
		selected = null;
		originalId = null;
		draft =
			kind === 'openai-compatible'
				? {
						id: 'new-judge',
						label: 'New API judge',
						kind,
						model: '',
						endpoint: {
							base_url: 'https://openrouter.ai/api/v1',
							api_key_env: 'OPENROUTER_API_KEY'
						},
						request: { temperature: 0 }
					}
				: {
						id: 'new-judge',
						label: 'New Claude judge',
						kind,
						model: 'claude-opus-5-5',
						effort: 'xhigh'
					};
		requestJson = draft.request ? JSON.stringify(draft.request, null, 2) : '';
		dirty = true;
	}

	async function save() {
		if (!draft) return;
		let request: Record<string, unknown> | undefined;
		try {
			request = requestJson.trim() ? JSON.parse(requestJson) : undefined;
		} catch {
			toasts.push('error', 'Request extras are not valid JSON');
			return;
		}
		const d = $state.snapshot(draft) as JudgeProfile;
		const body: JudgeProfile = {
			...d,
			label: d.label || undefined,
			description: d.description || undefined,
			effort: d.kind === 'claude' ? d.effort || undefined : undefined,
			mode: d.kind === 'claude' ? d.mode || undefined : undefined,
			endpoint: d.kind === 'openai-compatible' ? d.endpoint : undefined,
			request: d.kind === 'openai-compatible' ? request : undefined,
			images: d.kind === 'openai-compatible' ? d.images : undefined,
			max_chars: d.kind === 'openai-compatible' ? d.max_chars || undefined : undefined,
			model: d.kind === 'dry-run' ? undefined : d.model
		};
		busy = true;
		try {
			benchy.setLibrary(await benchy.api.saveJudge(originalId ?? body.id, body));
			selected = body.id;
			originalId = body.id;
			dirty = false;
			toasts.push('ok', 'Judge profile saved', `library/judges/${body.id}.yaml`);
		} catch (e) {
			toasts.error(e);
		} finally {
			busy = false;
		}
	}
</script>

<Split width={250}>
	{#snippet side()}
		<div class="side-head">
			<b class="grow">Profiles</b>
			{#if benchy.live}
				<Button size="sm" icon="plus" variant="primary" onclick={() => fresh('claude')} />
			{/if}
		</div>
		{#each judges as j (j.profile.id)}
			<ListItem active={selected === j.profile.id} onclick={() => pick(j.profile.id)}>
				<b class="ellipsis">{j.profile.label ?? j.profile.id}</b>
				<span class="meta"
					>{j.profile.kind}{j.profile.model ? ` · ${j.profile.model}` : ''}{j.default
						? ' · default'
						: ''}{j.key_set === false ? ' · key missing' : ''}</span
				>
			</ListItem>
		{:else}
			<Empty icon="gavel" title="No profiles" />
		{/each}
		{#if benchy.live}
			<div class="side-foot">
				<Button size="sm" variant="ghost" icon="plus" onclick={() => fresh('openai-compatible')}
					>API judge</Button
				>
			</div>
		{/if}
	{/snippet}
	{#snippet main()}
		{#if !draft}
			<Empty icon="gavel" title="Select a profile">A judge model with its settings.</Empty>
		{:else}
			<div class="head">
				<h2 class="grow ellipsis">{draft.label || draft.id}</h2>
				{#if entry?.default}<span class="badge">default</span>{/if}
				{#if entry?.builtin}<span class="badge muted">built in</span>{/if}
				{#if benchy.live}
					{#if originalId && !entry?.default && !entry?.builtin}<Button
							size="sm"
							variant="danger"
							icon="trash"
							onclick={async () => {
								if (confirm('Delete this judge profile? Its past judgements stay.')) {
									benchy.setLibrary(await benchy.api.deleteJudge(originalId!));
									draft = null;
									selected = null;
								}
							}}
						/>{/if}
					<Button variant="primary" icon="save" loading={busy} disabled={!dirty} onclick={save}
						>Save</Button
					>
				{/if}
			</div>
			<div class="form scroll" oninput={() => (dirty = true)} onchange={() => (dirty = true)}>
				<fieldset disabled={!benchy.live}>
					<div class="grid2">
						<div>
							<label class="label" for="j-id">Id</label>
							<input id="j-id" class="input mono" bind:value={draft.id} />
						</div>
						<div>
							<label class="label" for="j-label">Label</label>
							<input id="j-label" class="input" bind:value={draft.label} />
						</div>
					</div>
					<label class="label" for="j-desc">Description</label>
					<input id="j-desc" class="input" bind:value={draft.description} />
					<label class="label" for="j-kind">Kind</label>
					<select id="j-kind" class="select" bind:value={draft.kind}>
						<option value="claude">claude -p (subscription)</option>
						<option value="openai-compatible">OpenAI-compatible API</option>
						<option value="dry-run">dry-run (no model)</option>
					</select>
					{#if draft.kind !== 'dry-run'}
						<label class="label" for="j-model">Model</label>
						<input
							id="j-model"
							class="input mono"
							list={draft.kind === 'claude' ? 'j-claude-models' : undefined}
							bind:value={draft.model}
						/>
						<datalist id="j-claude-models"
							><option value="claude-opus-5-5"></option><option value="claude-sonnet-5-5"
							></option><option value="claude-fable-5-1"></option><option value="haiku"
							></option></datalist
						>
					{/if}
					{#if draft.kind === 'claude'}
						<div class="grid2">
							<div>
								<label class="label" for="j-effort">Effort</label>
								<select id="j-effort" class="select" bind:value={draft.effort}>
									<option value={undefined}>default</option>
									{#each ['low', 'medium', 'high', 'xhigh', 'max'] as e (e)}<option value={e}
											>{e}</option
										>{/each}
								</select>
							</div>
							<div>
								<label class="label" for="j-mode">Depth</label>
								<select id="j-mode" class="select" bind:value={draft.mode}>
									<option value={undefined}>per test</option>
									<option value="static">always static</option>
									<option value="interactive">always interactive</option>
								</select>
							</div>
						</div>
					{/if}
					{#if draft.kind === 'openai-compatible' && draft.endpoint}
						{@const ep = draft.endpoint}
						<label class="label" for="j-url">Base URL</label>
						<input
							id="j-url"
							class="input mono"
							placeholder="https://openrouter.ai/api/v1"
							bind:value={ep.base_url}
						/>
						<label class="label" for="j-key">API key variable</label>
						<div class="row">
							<input
								id="j-key"
								class="input mono"
								placeholder="OPENROUTER_API_KEY"
								bind:value={ep.api_key_env}
							/>
							<Button size="sm" variant="ghost" icon="gear" onclick={() => wm.open('settings')}
								>Set key</Button
							>
						</div>
						<div class="grid2">
							<div>
								<label class="label" for="j-max">Max submission characters</label>
								<input
									id="j-max"
									class="input"
									type="number"
									min="1000"
									placeholder="120000"
									bind:value={draft.max_chars}
								/>
							</div>
							<div>
								<span class="label">Screenshots</span>
								<label class="opt"
									><input
										type="checkbox"
										checked={draft.images !== false}
										onchange={(e) => (draft!.images = e.currentTarget.checked ? undefined : false)}
									/> send as images (vision model)</label
								>
							</div>
						</div>
						<label class="label" for="j-req">Request extras (JSON, merged into the chat body)</label
						>
						<textarea
							id="j-req"
							class="input mono"
							rows="5"
							placeholder={'{ "temperature": 0 }'}
							bind:value={requestJson}></textarea>
						<p class="hint muted">
							API judges cannot run the submission. They read the code, the check results and the
							screenshots, so interactive tests are judged statically.
						</p>
					{/if}
				</fieldset>
			</div>
		{/if}
	{/snippet}
</Split>

<style>
	.side-head,
	.side-foot {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		padding: var(--sp-5);
		border-bottom: var(--bw) solid var(--line-soft);
	}
	.side-foot {
		border-bottom: 0;
	}
	.meta {
		font-size: var(--fs-s);
		color: var(--fg-3);
	}
	.head {
		display: flex;
		gap: var(--sp-4);
		align-items: center;
		padding: var(--sp-5) var(--sp-6);
		border-bottom: var(--bw) solid var(--line-soft);
	}
	h2 {
		margin: 0;
		font-size: var(--fs-l);
	}
	.badge {
		font-size: var(--fs-xs);
		padding: 0 var(--sp-3);
		border: var(--bw) solid var(--line-strong);
		color: var(--fg-2);
	}
	.form {
		flex: 1;
		padding: var(--sp-6) var(--sp-6) var(--sp-7);
	}
	fieldset {
		border: 0;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
		max-width: 760px;
	}
	fieldset .label {
		margin-top: var(--sp-4);
	}
	.grid2 {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0 var(--sp-5);
	}
	.opt {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		height: var(--row-h);
		font-size: var(--fs-m);
	}
	.opt input {
		accent-color: var(--accent);
	}
	.hint {
		font-size: var(--fs-s);
		margin: var(--sp-3) 0 0;
	}
</style>
