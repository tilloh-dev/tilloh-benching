<script lang="ts">
	let { kind }: { kind: string } = $props();
	const labels: Record<string, string> = {
		'llama-cpp': 'llama.cpp',
		'openai-compatible': 'api',
		'claude-code': 'claude-code',
		'dry-run': 'dry-run'
	};
</script>

<span class="kind">{labels[kind] ?? kind}</span>

<style>
	.kind {
		display: inline-flex;
		align-items: center;
		height: 16px;
		padding: 0 var(--sp-2);
		border: var(--bw) solid var(--line);
		font-size: var(--fs-xs);
		color: var(--fg-2);
		white-space: nowrap;
	}
</style>
