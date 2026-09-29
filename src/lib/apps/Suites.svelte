<script lang="ts">
	import type { Suite } from '$engine/core/schema.ts';
	import type { Win } from '../os/wm.svelte.ts';
	import { wm } from '../os/wm.svelte.ts';
	import { benchy } from '../data/store.svelte.ts';
	import { toasts } from '../os/toasts.svelte.ts';
	import Split from '../ui/Split.svelte';
	import ListItem from '../ui/ListItem.svelte';
	import Button from '../ui/Button.svelte';
	import Empty from '../ui/Empty.svelte';

	let { win: _win, props }: { win: Win; props: Record<string, unknown> } = $props();

	let selected = $state<string | null>(null);
	let originalId = $state<string | null>(null);
	let draft = $state<Suite | null>(null);
	let dirty = $state(false);
	let busy = $state(false);

	const suites = $derived(benchy.library?.suites ?? []);
	const tests = $derived(benchy.library?.tests ?? []);
	const blueprints = $derived(benchy.library?.blueprints ?? []);

	$effect(() => {
		const want = props.select as string | undefined;
		if (want) pick(want);
		else if (!selected && !draft && suites.length) pick(suites[0].id);
	});

	function pick(id: string) {
		const s = suites.find((x) => x.id === id);
		if (!s) return;
		selected = id;
		originalId = id;
		draft = structuredClone($state.snapshot(s)) as Suite;
		dirty = false;
	}

	function toggle(list: string[] | undefined, id: string): string[] {
		const l = list ?? [];
		return l.includes(id) ? l.filter((x) => x !== id) : [...l, id];
	}

	async function save() {
		if (!draft) return;
		busy = true;
		try {
			const body = {
				...$state.snapshot(draft),
				blueprints: draft.blueprints?.length ? draft.blueprints : undefined
			};
			benchy.setLibrary(await benchy.api.saveSuite(originalId ?? draft.id, body));
			selected = draft.id;
			originalId = draft.id;
			dirty = false;
			toasts.push('ok', 'Suite saved');
		} catch (e) {
			toasts.error(e);
		} finally {
			busy = false;
		}
	}
</script>

<Split width={260}>
	{#snippet side()}
		<div class="side-head">
			<b class="grow">Suites</b>
			{#if benchy.live}
				<Button
					icon="plus"
					size="sm"
					variant="primary"
					onclick={() => {
						selected = null;
						originalId = null;
						draft = { id: 'new-suite', title: 'New suite', tests: [], repetitions: 1 };
						dirty = true;
					}}
				/>
			{/if}
		</div>
		{#each suites as s (s.id)}
			<ListItem active={selected === s.id} onclick={() => pick(s.id)}>
				<b class="ellipsis">{s.title}</b>
				<span class="meta">{s.tests.length} tests · ×{s.repetitions ?? 1}</span>
			</ListItem>
		{:else}
			<Empty icon="layers" title="No suites" />
		{/each}
	{/snippet}
	{#snippet main()}
		{#if !draft}
			<Empty icon="layers" title="Select a suite">A named set of tests you run together.</Empty>
		{:else}
			<div class="head">
				<h2 class="grow ellipsis">{draft.title}</h2>
				{#if benchy.live}
					<Button
						size="sm"
						variant="ghost"
						icon="play"
						disabled={dirty || !draft.tests.length}
						onclick={() =>
							wm.open('launcher', { tests: draft!.tests, blueprints: draft!.blueprints ?? [] })}
						>Run</Button
					>
					{#if originalId}<Button
							size="sm"
							variant="danger"
							icon="trash"
							onclick={async () => {
								if (confirm('Delete suite?')) {
									benchy.setLibrary(await benchy.api.deleteSuite(originalId!));
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
							<label class="label" for="s-id">Id</label><input
								id="s-id"
								class="input mono"
								bind:value={draft.id}
							/>
						</div>
						<div>
							<label class="label" for="s-title">Title</label><input
								id="s-title"
								class="input"
								bind:value={draft.title}
							/>
						</div>
					</div>
					<label class="label" for="s-desc">Description</label>
					<input id="s-desc" class="input" bind:value={draft.description} />
					<label class="label" for="s-reps">Default repetitions</label>
					<input
						id="s-reps"
						class="input"
						type="number"
						min="1"
						max="50"
						bind:value={draft.repetitions}
						style="max-width:120px"
					/>
					<h4 class="section-title">Tests ({draft.tests.length})</h4>
					<div class="checks">
						{#each tests as t (t.id)}
							<label class="opt" class:on={draft.tests.includes(t.id)}
								><input
									type="checkbox"
									checked={draft.tests.includes(t.id)}
									onchange={() => (draft!.tests = toggle(draft!.tests, t.id))}
								/><span class="mono">{t.id}</span><span class="muted ellipsis">{t.file.title}</span
								></label
							>
						{/each}
					</div>
					<h4 class="section-title">Default blueprints (optional)</h4>
					<div class="checks">
						{#each blueprints as b (b.id)}
							<label class="opt" class:on={draft.blueprints?.includes(b.id)}
								><input
									type="checkbox"
									checked={draft.blueprints?.includes(b.id) ?? false}
									onchange={() => (draft!.blueprints = toggle(draft!.blueprints, b.id))}
								/><span class="mono">{b.id}</span></label
							>
						{/each}
					</div>
				</fieldset>
			</div>
		{/if}
	{/snippet}
</Split>

<style>
	.side-head {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		padding: var(--sp-5) var(--sp-5);
		border-bottom: var(--bw) solid var(--line-soft);
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
		max-width: 820px;
	}
	fieldset .label {
		margin-top: var(--sp-4);
	}
	.grid2 {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0 var(--sp-5);
	}
	.checks {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: var(--sp-2);
	}
	.opt {
		display: flex;
		align-items: center;
		gap: var(--sp-4);
		padding: var(--sp-3) var(--sp-4);
		border: var(--bw) solid var(--line-soft);
		cursor: pointer;
		font-size: var(--fs-m);
		min-width: 0;
	}
	.opt.on {
		border-color: var(--accent);
		background: var(--accent-soft);
	}
	.opt input {
		accent-color: var(--accent);
	}
</style>
