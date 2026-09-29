<script lang="ts">
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
		running: ['live', '◐'],
		generating: ['live', '◐'],
		checking: ['live', '◐'],
		judging: ['live', '◐']
	};
	const [tone, symbol] = $derived(map[status ?? ''] ?? ['muted', '·']);
</script>

<span class="status {tone}"><i aria-hidden="true">{symbol}</i>{label ?? status ?? '—'}</span>

<style>
	.status {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-2);
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
	}
	.warn {
		--c: var(--warn);
	}
	.bad {
		--c: var(--bad);
	}
	.muted {
		--c: var(--muted);
	}
	.info {
		--c: var(--info);
	}
	.live {
		--c: var(--fg);
	}
	.live i {
		animation: blink var(--dur-3) steps(2) infinite;
	}
</style>
