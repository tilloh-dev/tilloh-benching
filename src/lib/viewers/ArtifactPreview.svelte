<script lang="ts">
	import type { ArtifactRef } from '$engine/core/schema.ts';
	import type { AttemptDetail } from '$engine/api-types.ts';
	import { extensionOf, kindInfo } from '$engine/core/kinds.ts';
	import { benchy } from '../data/store.svelte.ts';
	import Code from '../ui/Code.svelte';
	import Markdown from '../ui/Markdown.svelte';
	import Segmented from '../ui/Segmented.svelte';
	import Spinner from '../ui/Spinner.svelte';
	import HtmlFrame from './HtmlFrame.svelte';
	import Model3D from './Model3D.svelte';

	let { detail, artifact }: { detail: AttemptDetail; artifact: ArtifactRef } = $props();

	const url = $derived(benchy.api.fileUrl(`${detail.attempt.id}/${artifact.path}`));
	const info = $derived(kindInfo(artifact.kind));
	const ext = $derived(extensionOf(artifact.path));
	const hasRender = $derived(
		['html', 'svg', 'markdown', 'model3d', 'image'].includes(info.viewer) &&
			!(info.viewer === 'model3d' && ext === 'scad')
	);
	let view = $state('render');
	let text = $state<string | null>(null);
	let loading = $state(false);

	$effect(() => {
		const needsText =
			info.textual && (!hasRender || view === 'source' || info.viewer === 'markdown');
		if (!needsText) return;
		loading = true;
		text = null;
		benchy.api.text(url).then((t) => {
			text = t;
			loading = false;
		});
	});

	const programLogs = $derived(
		detail.attempt.evidence.filter((e) => e.check === 'program.run' && e.kind === 'log')
	);
	let logTexts = $state<Record<string, string>>({});
	$effect(() => {
		for (const log of programLogs) {
			if (logTexts[log.path] !== undefined) continue;
			benchy.api
				.text(benchy.api.fileUrl(`${detail.attempt.id}/${log.path}`))
				.then((t) => (logTexts[log.path] = t));
		}
	});
</script>

<div class="preview">
	{#if hasRender}
		<div class="switch">
			<Segmented
				options={[
					{ id: 'render', label: info.viewer === 'markdown' ? 'Rendered' : 'Preview' },
					{ id: 'source', label: 'Source' }
				]}
				bind:value={view}
			/>
			<span class="muted mono small"
				>{artifact.path.replace(/^artifacts\//, '')} · {(artifact.bytes / 1024).toFixed(1)} KB</span
			>
		</div>
	{/if}
	<div class="stage">
		{#if hasRender && view === 'render'}
			{#if info.viewer === 'html'}
				<HtmlFrame src={url} title={artifact.path.replace(/^artifacts\//, '')} />
			{:else if info.viewer === 'svg' || info.viewer === 'image'}
				<div class="img-stage"><img src={url} alt={artifact.path} /></div>
			{:else if info.viewer === 'model3d'}
				<Model3D src={url} format={ext} />
			{:else if info.viewer === 'markdown'}
				<div class="md-stage">
					{#if text !== null}<Markdown source={text} />{:else}<Spinner />{/if}
				</div>
			{/if}
		{:else if !info.textual}
			<div class="bin">
				<p>{artifact.path} · {(artifact.bytes / 1024).toFixed(1)} KB</p>
				<a href={url} download>Download</a>
			</div>
		{:else if loading || text === null}
			<Spinner />
		{:else}
			<div class="code-stage">
				<Code code={text} path={artifact.path} />
				{#if info.viewer === 'program' && programLogs.length}
					<h4 class="section-title">Sandbox runs</h4>
					{#each programLogs as log (log.path)}
						<details class="log" open={programLogs.length <= 3}>
							<summary>{log.label}</summary>
							<Code code={logTexts[log.path] ?? '…'} lang="bash" lineNumbers={false} wrap />
						</details>
					{/each}
				{/if}
			</div>
		{/if}
	</div>
</div>

<style>
	.preview {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
		gap: var(--sp-4);
	}
	.switch {
		flex: none;
		display: flex;
		align-items: center;
		gap: var(--sp-5);
	}
	.small {
		font-size: var(--fs-s);
	}
	.stage {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}
	.img-stage {
		flex: 1;
		display: grid;
		place-items: center;
		overflow: auto;
		border: var(--bw) solid var(--line-soft);
		background: var(--sunken);
	}
	.img-stage img {
		max-width: 100%;
		max-height: 100%;
	}
	.md-stage,
	.code-stage {
		flex: 1;
		overflow: auto;
		min-height: 0;
	}
	.md-stage {
		padding: var(--sp-3) var(--sp-7) var(--sp-7);
		border: var(--bw) solid var(--line-soft);
		background: var(--sunken);
	}
	.code-stage {
		display: flex;
		flex-direction: column;
		gap: var(--sp-5);
	}
	.log summary {
		cursor: pointer;
		color: var(--fg-2);
		padding: var(--sp-2) 0;
	}
	.bin {
		display: grid;
		place-items: center;
		height: 100%;
		color: var(--fg-3);
	}
</style>
