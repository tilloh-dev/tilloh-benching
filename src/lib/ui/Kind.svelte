<script lang="ts">
	import Icon from '../os/Icon.svelte';
	let { kind }: { kind: string } = $props();
	const meta: Record<string, { icon: string; label: string; hue: number }> = {
		'llama-cpp': { icon: 'chip', label: 'llama.cpp', hue: 150 },
		'openai-compatible': { icon: 'external', label: 'API', hue: 210 },
		'claude-code': { icon: 'sparkle', label: 'Claude Code', hue: 22 },
		'dry-run': { icon: 'flask', label: 'dry-run', hue: 270 }
	};
	const m = $derived(meta[kind] ?? { icon: 'dot', label: kind, hue: 230 });
</script>

<span class="kind" style="--h:{m.hue}"
	><Icon name={m.icon} size={12} accent={false} />{m.label}</span
>

<style>
	.kind {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		height: 20px;
		padding: 0 7px;
		border-radius: 6px;
		font-size: 11px;
		font-weight: 600;
		white-space: nowrap;
		color: hsl(var(--h) 80% 78%);
		background: hsl(var(--h) 60% 40% / 0.14);
		border: 1px solid hsl(var(--h) 60% 50% / 0.3);
	}
</style>
