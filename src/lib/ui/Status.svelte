<script lang="ts">
	import Busy from './Busy.svelte';

	/** Every check or run state: symbol + word, so status never depends on color alone. */
	let { status, label }: { status: string | null | undefined; label?: string } = $props();
	const map: Record<string, [tone: string, symbol: string]> = {
		ok: ['ok', '●'],
		pass: ['ok', '●'],
		done: ['ok', '●'],
		judged: ['ok', '●'],
		warnings: ['warn', '▲'],
		warn: ['warn', '▲'],
		interrupted: ['warn', '▲'],
		broken: ['bad', '✕'],
		fail: ['bad', '✕'],
		failed: ['bad', '✕'],
		error: ['bad', '✕'],
		cancelled: ['muted', '○'],
		skipped: ['muted', '○'],
		pending: ['muted', '○'],
		queued: ['info', '○'],
		generated: ['info', '◇'],
		checked: ['info', '◆'],
		running: ['live', ''],
		generating: ['live', ''],
		checking: ['live', ''],
		judging: ['live', '']
	};
	const [tone, symbol] = $derived(map[status ?? ''] ?? ['muted', '·']);
</script>

<span class="status {tone}"
	>{#if tone === 'live'}<Busy />{:else}<i aria-hidden="true">{symbol}</i>{/if}{label ??
		status ??
		'—'}</span
>

<style>
	.status {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-2);
		height: 18px;
		padding: 0 var(--sp-2);
		background: var(--bg-soft, transparent);
		font-size: var(--fs-s);
		font-weight: var(--fw-strong);
		white-space: nowrap;
		color: var(--c);
	}
	i {
		font-style: normal;
	}
	.ok {
		--c: var(--ok);
		--bg-soft: var(--ok-soft);
	}
	.warn {
		--c: var(--warn);
		--bg-soft: var(--warn-soft);
	}
	.bad {
		--c: var(--bad);
		--bg-soft: var(--bad-soft);
	}
	.muted {
		--c: var(--muted);
	}
	.info {
		--c: var(--info);
		--bg-soft: var(--info-soft);
	}
	.live {
		--c: var(--fg);
		--bg-soft: var(--surface-3);
	}
</style>
