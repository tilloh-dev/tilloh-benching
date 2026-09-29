<script lang="ts">
	let { status, label }: { status: string | null | undefined; label?: string } = $props();
	const map: Record<string, string> = {
		ok: 'ok',
		pass: 'ok',
		done: 'ok',
		judged: 'ok',
		warnings: 'warn',
		warn: 'warn',
		interrupted: 'warn',
		broken: 'bad',
		fail: 'bad',
		failed: 'bad',
		error: 'bad',
		cancelled: 'muted',
		skipped: 'muted',
		queued: 'info',
		pending: 'muted',
		running: 'live',
		generating: 'live',
		checking: 'live',
		judging: 'live',
		generated: 'info',
		checked: 'info'
	};
	const tone = $derived(map[status ?? ''] ?? 'muted');
</script>

<span class="badge {tone}"><i></i>{label ?? status ?? '—'}</span>

<style>
	.badge {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		height: 22px;
		padding: 0 9px 0 7px;
		border-radius: 999px;
		font-size: 11.5px;
		font-weight: 600;
		letter-spacing: 0.02em;
		white-space: nowrap;
		border: 1px solid color-mix(in srgb, var(--c) 40%, transparent);
		background: color-mix(in srgb, var(--c) 12%, transparent);
		color: color-mix(in srgb, var(--c) 85%, white);
	}
	i {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--c);
		color: var(--c);
		box-shadow: 0 0 8px var(--c);
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
		--c: var(--yellow);
	}
	.live i {
		animation: pulse-led 1.2s ease-in-out infinite;
	}
</style>
