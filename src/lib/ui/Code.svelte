<script lang="ts">
	import { highlight, languageFor } from './highlight.ts';

	let {
		code,
		lang = null,
		path = '',
		lineNumbers = true,
		maxHeight = null,
		wrap = false
	}: {
		code: string;
		lang?: string | null;
		path?: string;
		lineNumbers?: boolean;
		maxHeight?: string | null;
		wrap?: boolean;
	} = $props();

	const language = $derived(lang ?? languageFor(path));
	const html = $derived(highlight(code, language));
	const lines = $derived(code.split('\n').length);
</script>

<div class="code" class:wrap style={maxHeight ? `max-height:${maxHeight}` : ''}>
	{#if lineNumbers}
		<pre class="gutter" aria-hidden="true">{Array.from({ length: lines }, (_, i) => i + 1).join(
				'\n'
			)}</pre>
	{/if}
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- highlight() escapes its input -->
	<pre class="src hljs"><code>{@html html}</code></pre>
</div>

<style>
	.code {
		display: flex;
		overflow: auto;
		background: var(--bg-0);
		border: 1px solid var(--line-soft);
		border-radius: var(--radius);
		font-family: var(--mono);
		font-size: 12.5px;
		line-height: 1.6;
	}
	pre {
		margin: 0;
		padding: 12px 14px;
	}
	.gutter {
		position: sticky;
		left: 0;
		flex: none;
		text-align: right;
		color: var(--text-4);
		background: var(--bg-0);
		border-right: 1px solid var(--line-soft);
		user-select: none;
		padding-right: 10px;
	}
	.src {
		flex: 1;
		min-width: 0;
		color: #d9e0ff;
	}
	.wrap .src {
		white-space: pre-wrap;
		word-break: break-word;
	}
	.code :global(.hljs-keyword),
	.code :global(.hljs-selector-tag),
	.code :global(.hljs-built_in) {
		color: #ffd23f;
	}
	.code :global(.hljs-string),
	.code :global(.hljs-attr),
	.code :global(.hljs-selector-attr) {
		color: #7ee6c3;
	}
	.code :global(.hljs-number),
	.code :global(.hljs-literal) {
		color: #ff9f7a;
	}
	.code :global(.hljs-comment) {
		color: #5d6ba3;
		font-style: italic;
	}
	.code :global(.hljs-title),
	.code :global(.hljs-name),
	.code :global(.hljs-section) {
		color: #8fb8ff;
	}
	.code :global(.hljs-attribute),
	.code :global(.hljs-variable),
	.code :global(.hljs-template-variable),
	.code :global(.hljs-property) {
		color: #c9a8ff;
	}
	.code :global(.hljs-tag) {
		color: #9fb0e6;
	}
	.code :global(.hljs-meta) {
		color: #ff7ab8;
	}
</style>
