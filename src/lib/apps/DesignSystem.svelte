<script lang="ts">
	import type { Win } from '../os/wm.svelte.ts';
	import { PIXEL_ICONS } from '../os/pixel-icons.ts';
	import Icon from '../os/Icon.svelte';
	import AppTile from '../os/AppTile.svelte';
	import Button from '../ui/Button.svelte';
	import Status from '../ui/Status.svelte';
	import Score from '../ui/Score.svelte';
	import Tabs from '../ui/Tabs.svelte';
	import Segmented from '../ui/Segmented.svelte';
	import Toggle from '../ui/Toggle.svelte';
	import Kind from '../ui/Kind.svelte';
	import Code from '../ui/Code.svelte';

	/**
	 * The living reference for docs/DESIGN.md: every token and component,
	 * optionally in both themes side by side.
	 */
	let { win: _win }: { win: Win } = $props();

	let layout = $state('single');
	let section = $state('colors');
	let tab = $state('a');
	let seg = $state('one');
	let flag = $state(true);
	let replay = $state(0);

	const COLORS: [string, string[]][] = [
		['Surfaces', ['--bg', '--surface', '--surface-2', '--surface-3', '--sunken', '--hover']],
		['Lines', ['--line', '--line-soft', '--line-strong']],
		['Text', ['--fg', '--fg-2', '--fg-3', '--fg-4']],
		['Accent', ['--accent', '--accent-text', '--accent-fg', '--accent-soft', '--focus']],
		['Status', ['--ok', '--warn', '--bad', '--info', '--muted']],
		['Status fills', ['--ok-soft', '--warn-soft', '--bad-soft', '--info-soft']],
		[
			'Identity hues',
			['--hue-1', '--hue-2', '--hue-3', '--hue-4', '--hue-5', '--hue-6', '--hue-7', '--hue-8']
		],
		[
			'Data',
			['--data', '--track', '--score-1', '--score-2', '--score-3', '--score-4', '--score-5']
		],
		[
			'Syntax',
			[
				'--syn-keyword',
				'--syn-string',
				'--syn-number',
				'--syn-comment',
				'--syn-name',
				'--syn-attr',
				'--syn-tag'
			]
		]
	];
	const TYPE = ['--fs-xs', '--fs-s', '--fs-m', '--fs-l', '--fs-xl', '--fs-xxl'];
	const SPACE = ['--sp-1', '--sp-2', '--sp-3', '--sp-4', '--sp-5', '--sp-6', '--sp-7'];
	const ICONS = Object.keys(PIXEL_ICONS).sort();
	const SAMPLE = 'const score = weighted / total; // 0–100\nif (required && s < 5) gate = true;';
	const themes = $derived(layout === 'both' ? ['dark', 'light'] : [null]);
</script>

<div class="ds">
	<div class="bar">
		<Tabs
			small
			bind:active={section}
			tabs={[
				{ id: 'colors', label: 'Colors' },
				{ id: 'type', label: 'Type & space' },
				{ id: 'components', label: 'Components' },
				{ id: 'icons', label: 'Icons', count: ICONS.length },
				{ id: 'motion', label: 'Motion' }
			]}
		/>
		<span class="spacer"></span>
		<Segmented
			options={[
				{ id: 'single', label: 'current theme' },
				{ id: 'both', label: 'dark | light' }
			]}
			bind:value={layout}
		/>
	</div>

	<div class="panes" class:both={layout === 'both'}>
		{#each themes as t (t ?? 'current')}
			<div class="pane scroll" data-theme={t ?? undefined}>
				{#if t}<div class="pane-label">{t}</div>{/if}

				{#if section === 'colors'}
					{#each COLORS as [group, tokens] (group)}
						<h3 class="section-title">{group}</h3>
						<div class="swatches">
							{#each tokens as token (token)}
								<div class="swatch">
									<span class="chip" style="background: var({token})"></span>
									<code>{token}</code>
								</div>
							{/each}
						</div>
					{/each}
					<p class="hint">
						Accent = primary action, active tab, selection mark, focus. Nothing else.
					</p>
				{:else if section === 'type'}
					<h3 class="section-title">Type scale · IBM Plex Mono</h3>
					{#each TYPE as token (token)}
						<div class="type-row">
							<code>{token}</code><span style="font-size: var({token})">Benchmark 0123456789</span>
						</div>
					{/each}
					<div class="type-row"><code>--fw-strong</code><b>Recognizable violin geometry</b></div>
					<h3 class="section-title">Spacing · 2 px grid</h3>
					{#each SPACE as token (token)}
						<div class="space-row">
							<code>{token}</code><span class="space" style="width: var({token})"></span>
						</div>
					{/each}
				{:else if section === 'components'}
					<h3 class="section-title">Buttons — one primary per view</h3>
					<div class="row wrap">
						<Button variant="primary" icon="play">Start run</Button>
						<Button icon="check">Preflight</Button>
						<Button variant="ghost" icon="refresh">Rescan</Button>
						<Button variant="danger" icon="trash">Delete</Button>
						<Button disabled>Disabled</Button>
						<Button size="sm" icon="plus">Small</Button>
						<Button icon="search" title="Icon only" />
					</div>
					<h3 class="section-title">Status — symbol + word</h3>
					<div class="row wrap">
						{#each ['ok', 'warnings', 'broken', 'failed', 'pending', 'queued', 'running', 'checked'] as st (st)}<Status
								status={st}
							/>{/each}
					</div>
					<h3 class="section-title">Score — number, meter, gate</h3>
					<div class="col">
						<Score value={12} /><Score value={34} /><Score value={55} /><Score
							value={71}
							stddev={4.2}
						/><Score value={92} /><Score value={38} gate />
						<Score value={82.4} big width={140} />
					</div>
					<h3 class="section-title">Navigation and inputs</h3>
					<Tabs
						bind:active={tab}
						tabs={[
							{ id: 'a', label: 'Preview' },
							{ id: 'b', label: 'Checks', count: 3 },
							{ id: 'c', label: 'Verdict' }
						]}
					/>
					<div class="row wrap" style="margin-top: var(--sp-4)">
						<Segmented
							options={[
								{ id: 'one', label: 'Judge' },
								{ id: 'two', label: 'Human' },
								{ id: 'three', label: 'Blend' }
							]}
							bind:value={seg}
						/>
						<Toggle bind:checked={flag} label="Split versions" />
						<Kind kind="llama-cpp" /><Kind kind="claude-code" />
					</div>
					<div class="grid2">
						<div>
							<label class="label" for="ds-in-{t}">Input</label><input
								id="ds-in-{t}"
								class="input"
								placeholder="placeholder"
							/>
						</div>
						<div>
							<label class="label" for="ds-sel-{t}">Select</label>
							<select id="ds-sel-{t}" class="select"><option>All tests</option></select>
						</div>
					</div>
					<h3 class="section-title">Table — selected row carries the accent mark</h3>
					<table class="table">
						<thead
							><tr
								><th>#</th><th>Blueprint</th><th>Score</th><th>Checks</th><th class="num">t/s</th
								></tr
							></thead
						>
						<tbody>
							<tr class="selected"
								><td>1</td><td>gemma-4-31B</td><td><Score value={82.4} width={60} /></td><td
									><Status status="ok" /></td
								><td class="num">41.2</td></tr
							>
							<tr
								><td>2</td><td>Qwen3.6-27B</td><td><Score value={77} width={60} /></td><td
									><Status status="warnings" /></td
								><td class="num">38.9</td></tr
							>
							<tr
								><td>3</td><td>Ornith-1.5-35B-A3B</td><td><Score value={51.3} width={60} gate /></td
								><td><Status status="broken" /></td><td class="num">55.0</td></tr
							>
						</tbody>
					</table>
					<h3 class="section-title">Code</h3>
					<Code code={SAMPLE} lang="typescript" />
					<h3 class="section-title">Tiles</h3>
					<div class="row">
						<AppTile icon="trophy" /><AppTile icon="rocket" selected /><AppTile
							icon="flask"
							size={36}
						/><AppTile icon="gavel" size={24} />
					</div>
				{:else if section === 'icons'}
					<p class="hint">
						12×12 pixel grid, one identity hue per icon (derived from its name). Only 12, 24 or 36
						px.
					</p>
					<div class="icons">
						{#each ICONS as name (name)}
							<div class="icon-cell">
								<span
									><Icon {name} size={12} /><Icon {name} size={24} /><Icon {name} size={36} /></span
								>
								<code>{name}</code>
							</div>
						{/each}
					</div>
				{:else if section === 'motion'}
					<h3 class="section-title">Retro moments</h3>
					<div class="row wrap">
						<Button onclick={() => replay++}>Replay window unfold</Button>
						<span class="caret">caret</span>
						<Status status="running" />
					</div>
					{#key replay}
						<div class="unfold card">A window opens in --steps visible steps (step-unfold).</div>
					{/key}
					<h3 class="section-title">Functional</h3>
					<p class="hint">
						Hover, press, menus and tabs: ≤ --dur-2, color/opacity only, no movement.
						prefers-reduced-motion sets every duration to 0.
					</p>
				{/if}
			</div>
		{/each}
	</div>
</div>

<style>
	.ds {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}
	.bar {
		flex: none;
		display: flex;
		align-items: center;
		gap: var(--sp-4);
		padding-right: var(--sp-4);
		border-bottom: var(--bw) solid var(--line);
	}
	.bar :global(.tabs) {
		border-bottom: 0;
	}
	.panes {
		flex: 1;
		min-height: 0;
		display: grid;
	}
	.panes.both {
		grid-template-columns: 1fr 1fr;
	}
	.pane {
		padding: var(--sp-5);
		background: var(--bg);
		color: var(--fg);
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
	}
	.panes.both .pane:first-child {
		border-right: var(--bw) solid var(--line-strong);
	}
	.pane-label {
		font-size: var(--fs-xs);
		text-transform: uppercase;
		color: var(--fg-3);
	}
	.section-title {
		margin-top: var(--sp-5);
	}
	.swatches {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
		gap: var(--sp-2);
	}
	.swatch {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
	}
	.chip {
		width: 24px;
		height: 24px;
		border: var(--bw) solid var(--line-strong);
		flex: none;
	}
	code {
		font-size: var(--fs-s);
		border: 0;
		background: none;
		color: var(--fg-2);
	}
	.type-row,
	.space-row {
		display: grid;
		grid-template-columns: 110px 1fr;
		align-items: center;
		gap: var(--sp-4);
	}
	.space {
		height: 12px;
		background: var(--data);
	}
	.grid2 {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--sp-4);
		margin-top: var(--sp-4);
	}
	.icons {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
		gap: var(--sp-2);
	}
	.icon-cell {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
		padding: var(--sp-3);
		border: var(--bw) solid var(--line-soft);
		color: var(--fg-2);
	}
	.icon-cell span {
		display: flex;
		align-items: flex-end;
		gap: var(--sp-3);
	}
	.unfold {
		margin-top: var(--sp-4);
		animation: step-unfold var(--dur-3) steps(var(--steps)) both;
	}
</style>
