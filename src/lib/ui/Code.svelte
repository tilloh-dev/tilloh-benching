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
		background: var(--sunken);
		border: var(--bw) solid var(--line-soft);
		font-family: var(--font);
		font-size: var(--fs-m);
		line-height: 1.6;
	}
	pre {
		margin: 0;
		padding: var(--sp-5) var(--sp-6);
	}
	.gutter {
		position: sticky;
		left: 0;
		flex: none;
		text-align: right;
		color: var(--fg-4);
		background: var(--sunken);
		border-right: var(--bw) solid var(--line-soft);
		user-select: none;
		padding-right: var(--sp-5);
	}
	.src {
		flex: 1;
		min-width: 0;
		color: var(--fg);
	}
	.wrap .src {
		white-space: pre-wrap;
		word-break: break-word;
	}
	.code :global(.hljs-keyword),
	.code :global(.hljs-selector-tag),
	.code :global(.hljs-built_in) {
		color: var(--syn-keyword);
	}
	.code :global(.hljs-string),
	.code :global(.hljs-attr),
	.code :global(.hljs-selector-attr) {
		color: var(--syn-string);
	}
	.code :global(.hljs-number),
	.code :global(.hljs-literal) {
		color: var(--syn-number);
	}
	.code :global(.hljs-comment) {
		color: var(--syn-comment);
		font-style: italic;
	}
	.code :global(.hljs-title),
	.code :global(.hljs-name),
	.code :global(.hljs-section) {
		color: var(--syn-name);
	}
	.code :global(.hljs-attribute),
	.code :global(.hljs-variable),
	.code :global(.hljs-template-variable),
	.code :global(.hljs-property) {
		color: var(--syn-attr);
	}
	.code :global(.hljs-tag) {
		color: var(--syn-tag);
	}
	.code :global(.hljs-meta) {
		color: var(--syn-attr);
	}
</style>
