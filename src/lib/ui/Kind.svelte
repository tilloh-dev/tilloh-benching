<script lang="ts">
	let { kind }: { kind: string } = $props();
	/** Each blueprint kind keeps one identity hue everywhere. */
	const meta: Record<string, [label: string, hue: number]> = {
		'llama-cpp': ['llama.cpp', 4],
		'openai-compatible': ['api', 6],
		'claude-code': ['claude-code', 2],
		'dry-run': ['dry-run', 7]
	};
	const [label, hue] = $derived(meta[kind] ?? [kind, 5]);
</script>

<span class="kind" style="--h: var(--hue-{hue})">{label}</span>

<style>
	.kind {
		display: inline-flex;
		align-items: center;
		height: 16px;
		padding: 0 var(--sp-2);
		border: var(--bw) solid color-mix(in srgb, var(--h) 45%, transparent);
		background: color-mix(in srgb, var(--h) 12%, transparent);
		color: var(--h);
		font-size: var(--fs-xs);
		white-space: nowrap;
	}
</style>
