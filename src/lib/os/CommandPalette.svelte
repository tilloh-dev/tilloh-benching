<script lang="ts">
	import { benchy } from '../data/store.svelte.ts';
	import Icon from './Icon.svelte';
	import { wm } from './wm.svelte.ts';

	let { open = $bindable(false) }: { open?: boolean } = $props();
	let q = $state('');
	let sel = $state(0);
	let input: HTMLInputElement | undefined = $state();

	type Hit = { icon: string; label: string; sub: string; action: () => void };

	const hits = $derived.by<Hit[]>(() => {
		const needle = q.trim().toLowerCase();
		const match = (s: string) => !needle || s.toLowerCase().includes(needle);
		const out: Hit[] = [];
		for (const a of wm.apps.values()) {
			if (a.desktop === false || (!benchy.live && a.liveOnly)) continue;
			if (match(a.title))
				out.push({ icon: a.icon, label: a.title, sub: 'App', action: () => wm.open(a.id) });
		}
		for (const r of benchy.runs) {
			if (match(`${r.label ?? ''} ${r.id}`))
				out.push({
					icon: 'rocket',
					label: r.label ?? r.id,
					sub: `Run · ${r.status}`,
					action: () => wm.open('runs', { select: r.id })
				});
		}
		for (const b of benchy.library?.blueprints ?? []) {
			if (match(`${b.id} ${b.file.label ?? ''}`))
				out.push({
					icon: 'blueprint',
					label: b.file.label ?? b.id,
					sub: `Blueprint · ${b.resolved?.kind ?? b.file.kind ?? ''}`,
					action: () => wm.open('blueprints', { select: b.id })
				});
		}
		for (const t of benchy.library?.tests ?? []) {
			if (match(`${t.id} ${t.file.title}`))
				out.push({
					icon: 'flask',
					label: t.file.title,
					sub: `Test · ${t.id}`,
					action: () => wm.open('tests', { select: t.id })
				});
		}
		if (needle.length >= 2) {
			for (const a of benchy.attempts) {
				if (out.length > 60) break;
				if (match(`${a.blueprint_label} ${a.test_id}`))
					out.push({
						icon: 'eye',
						label: `${a.blueprint_label} × ${a.test_id}`,
						sub: `Attempt #${a.rep} · ${a.score?.toFixed(1) ?? a.status ?? ''}`,
						action: () => wm.open('attempt', { key: a.id, id: a.id })
					});
			}
		}
		return out.slice(0, 60);
	});

	$effect(() => {
		if (open) {
			q = '';
			sel = 0;
			queueMicrotask(() => input?.focus());
		}
	});
	$effect(() => {
		void q;
		sel = 0;
	});

	function key(e: KeyboardEvent) {
		if (e.key === 'ArrowDown') {
			sel = Math.min(hits.length - 1, sel + 1);
			e.preventDefault();
		} else if (e.key === 'ArrowUp') {
			sel = Math.max(0, sel - 1);
			e.preventDefault();
		} else if (e.key === 'Enter' && hits[sel]) {
			hits[sel].action();
			open = false;
		} else if (e.key === 'Escape') open = false;
	}
</script>

{#if open}
	<div class="backdrop" role="presentation" onclick={() => (open = false)}>
		<div
			class="palette"
			role="dialog"
			aria-label="Command palette"
			tabindex="-1"
			onclick={(e) => e.stopPropagation()}
			onkeydown={key}
		>
			<div class="field">
				<span class="prompt">&gt;</span>
				<input
					bind:this={input}
					bind:value={q}
					placeholder="Search apps, runs, blueprints, tests, attempts…"
				/>
				<kbd>Esc</kbd>
			</div>
			<div class="list">
				{#each hits as h, i (h.sub + h.label + i)}
					<button
						class="hit"
						class:sel={i === sel}
						onmouseenter={() => (sel = i)}
						onclick={() => {
							h.action();
							open = false;
						}}
					>
						<Icon name={h.icon} size={12} />
						<span class="grow ellipsis">{h.label}</span>
						<span class="sub">{h.sub}</span>
					</button>
				{:else}
					<div class="none">Nothing found.</div>
				{/each}
			</div>
		</div>
	</div>
{/if}

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 45000;
		display: flex;
		justify-content: center;
		align-items: flex-start;
		padding-top: 14vh;
		background: color-mix(in srgb, var(--bg) 60%, transparent);
	}
	.palette {
		width: 600px;
		max-width: calc(100vw - 24px);
		background: var(--surface);
		border: var(--bw) solid var(--line-strong);
		box-shadow: var(--shadow-pop);
		animation: step-unfold var(--dur-2) steps(var(--steps)) both;
	}
	.field {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		height: 36px;
		padding: 0 var(--sp-4);
		border-bottom: var(--bw) solid var(--line);
		color: var(--fg-3);
	}
	.prompt {
		color: var(--fg-3);
	}
	input {
		flex: 1;
		border: 0;
		outline: none;
		background: transparent;
		color: var(--fg);
		font-size: var(--fs-l);
		caret-color: var(--accent);
	}
	.list {
		max-height: 50vh;
		overflow: auto;
		padding: var(--sp-1);
	}
	.hit {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		width: 100%;
		height: var(--row-h);
		padding: 0 var(--sp-3);
		border: 0;
		background: transparent;
		color: var(--fg-2);
		text-align: left;
		cursor: pointer;
	}
	.hit.sel {
		background: var(--accent-soft);
		color: var(--fg);
		box-shadow: inset 2px 0 0 var(--accent);
	}
	.sub {
		font-size: var(--fs-s);
		color: var(--fg-3);
	}
	.none {
		padding: var(--sp-6);
		text-align: center;
		color: var(--fg-3);
	}
</style>
