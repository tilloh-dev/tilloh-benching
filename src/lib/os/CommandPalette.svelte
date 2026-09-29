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
				<Icon name="search" size={18} />
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
						<Icon name={h.icon} size={16} />
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
		background: rgba(3, 6, 14, 0.55);
		backdrop-filter: blur(3px);
		display: flex;
		justify-content: center;
		align-items: flex-start;
		padding-top: 14vh;
		animation: fade-up 0.12s both;
	}
	.palette {
		width: 620px;
		max-width: calc(100vw - 24px);
		border-radius: var(--radius-l);
		background: rgba(16, 25, 58, 0.98);
		border: 1px solid var(--line-strong);
		box-shadow:
			var(--shadow-pop),
			0 0 50px rgba(255, 210, 63, 0.1);
		overflow: hidden;
		animation: pop 0.18s var(--ease-spring) both;
	}
	@keyframes pop {
		from {
			transform: scale(0.96);
			opacity: 0;
		}
	}
	.field {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 0 14px;
		height: 54px;
		border-bottom: 1px solid var(--line);
		color: var(--yellow);
	}
	input {
		flex: 1;
		border: 0;
		outline: none;
		background: transparent;
		font-size: 16px;
		color: var(--text);
	}
	.list {
		max-height: 50vh;
		overflow: auto;
		padding: 6px;
	}
	.hit {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		height: 38px;
		padding: 0 10px;
		border: 0;
		border-radius: 8px;
		background: transparent;
		color: var(--text-2);
		cursor: pointer;
		text-align: left;
	}
	.hit.sel {
		background: linear-gradient(90deg, var(--yellow-a20), var(--yellow-a10));
		color: var(--text);
	}
	.sub {
		font-size: 11.5px;
		color: var(--text-4);
	}
	.none {
		padding: 20px;
		text-align: center;
		color: var(--text-3);
	}
</style>
