<script lang="ts">
	import { marked } from 'marked';
	import DOMPurify from 'dompurify';
	import { hljs } from './highlight.ts';

	let { source }: { source: string } = $props();

	const html = $derived(
		DOMPurify.sanitize(marked.parse(source ?? '', { async: false, gfm: true }) as string, {
			FORBID_TAGS: ['style', 'form'],
			FORBID_ATTR: ['style']
		})
	);

	function highlightBlocks(node: HTMLElement, _html: string) {
		const run = () => {
			for (const el of node.querySelectorAll('pre code')) {
				if ((el as HTMLElement).innerText.length < 200_000)
					hljs.highlightElement(el as HTMLElement);
			}
			for (const a of node.querySelectorAll('a')) {
				a.setAttribute('target', '_blank');
				a.setAttribute('rel', 'noopener noreferrer');
			}
		};
		run();
		return { update: run };
	}
</script>

<!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitized by DOMPurify -->
<div class="md" use:highlightBlocks={html}>{@html html}</div>

<style>
	.md {
		color: var(--fg-2);
		line-height: 1.65;
		font-size: var(--fs-m);
		max-width: 820px;
	}
	.md :global(h1),
	.md :global(h2),
	.md :global(h3),
	.md :global(h4) {
		color: var(--fg);
		line-height: 1.25;
		margin: 1.3em 0 0.5em;
	}
	.md :global(h1) {
		font-size: var(--fs-xl);
	}
	.md :global(h2) {
		font-size: var(--fs-l);
		padding-bottom: var(--sp-3);
		border-bottom: var(--bw) solid var(--line-soft);
	}
	.md :global(h3) {
		font-size: var(--fs-m);
	}
	.md :global(p),
	.md :global(ul),
	.md :global(ol) {
		margin: 0.7em 0;
	}
	.md :global(strong) {
		color: var(--fg);
	}
	.md :global(code) {
		font-family: var(--font);
		font-size: 0.95em;
		background: var(--sunken);
		border: var(--bw) solid var(--line-soft);
		padding: var(--sp-1) var(--sp-3);
		color: var(--fg);
	}
	.md :global(pre) {
		background: var(--sunken);
		border: var(--bw) solid var(--line-soft);
		padding: var(--sp-5) var(--sp-6);
		overflow: auto;
	}
	.md :global(pre code) {
		background: none;
		border: 0;
		padding: 0;
		color: var(--fg);
	}
	.md :global(blockquote) {
		margin: 0.8em 0;
		padding: var(--sp-2) var(--sp-6);
		border-left: 2px solid var(--line-strong);
		color: var(--fg-3);
	}
	.md :global(table) {
		border-collapse: collapse;
		margin: 0.8em 0;
	}
	.md :global(th),
	.md :global(td) {
		border: var(--bw) solid var(--line);
		padding: var(--sp-3) var(--sp-4);
	}
	.md :global(hr) {
		border: 0;
		height: 1px;
		background: var(--line);
	}
	.md :global(img) {
		max-width: 100%;
	}
	.md :global(.hljs-keyword) {
		color: var(--syn-keyword);
	}
	.md :global(.hljs-string) {
		color: var(--syn-string);
	}
	.md :global(.hljs-comment) {
		color: var(--syn-comment);
	}
	.md :global(.hljs-number) {
		color: var(--syn-number);
	}
	.md :global(.hljs-title) {
		color: var(--syn-name);
	}
</style>
