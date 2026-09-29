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
		color: var(--text-2);
		line-height: 1.65;
		font-size: 14px;
		max-width: 820px;
	}
	.md :global(h1),
	.md :global(h2),
	.md :global(h3),
	.md :global(h4) {
		color: var(--text);
		line-height: 1.25;
		margin: 1.3em 0 0.5em;
	}
	.md :global(h1) {
		font-size: 24px;
	}
	.md :global(h2) {
		font-size: 19px;
		padding-bottom: 6px;
		border-bottom: 1px solid var(--line-soft);
	}
	.md :global(h3) {
		font-size: 16px;
	}
	.md :global(p),
	.md :global(ul),
	.md :global(ol) {
		margin: 0.7em 0;
	}
	.md :global(strong) {
		color: var(--text);
	}
	.md :global(code) {
		font-family: var(--mono);
		font-size: 12.5px;
		background: var(--bg-1);
		border: 1px solid var(--line-soft);
		border-radius: 5px;
		padding: 1px 5px;
		color: var(--yellow-2);
	}
	.md :global(pre) {
		background: var(--bg-0);
		border: 1px solid var(--line-soft);
		border-radius: var(--radius);
		padding: 12px 14px;
		overflow: auto;
	}
	.md :global(pre code) {
		background: none;
		border: 0;
		padding: 0;
		color: #d9e0ff;
	}
	.md :global(blockquote) {
		margin: 0.8em 0;
		padding: 4px 14px;
		border-left: 3px solid var(--yellow);
		color: var(--text-3);
		background: var(--yellow-a10);
		border-radius: 0 8px 8px 0;
	}
	.md :global(table) {
		border-collapse: collapse;
		margin: 0.8em 0;
	}
	.md :global(th),
	.md :global(td) {
		border: 1px solid var(--line);
		padding: 5px 9px;
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
		color: #ffd23f;
	}
	.md :global(.hljs-string) {
		color: #7ee6c3;
	}
	.md :global(.hljs-comment) {
		color: #5d6ba3;
	}
	.md :global(.hljs-number) {
		color: #ff9f7a;
	}
	.md :global(.hljs-title) {
		color: #8fb8ff;
	}
</style>
