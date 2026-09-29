import type { ArtifactRef, BenchTest, OutputFile } from '../core/schema.ts';
import { extensionOf, kindForLanguage, kindForPath } from '../core/kinds.ts';
import { safeRelative } from '../util/fs.ts';

export type CodeBlock = {
	lang: string;
	path?: string;
	body: string;
	closed: boolean;
	index: number;
};

export type ExtractedFile = {
	path: string;
	content: string;
	kind: string;
	declared: boolean;
	source: ArtifactRef['source'];
};

export type Extraction = { files: ExtractedFile[]; method: string; notes: string[] };

const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})\s*(.*)$/;
const FILENAME = /^[\w@+-][\w.@+/-]*\.[A-Za-z0-9]{1,8}$/;
const HINT =
	/^[\s>*#_`-]*(?:file(?:name)?\s*[:=]\s*)?`?([\w@+-][\w.@+/-]*\.[A-Za-z0-9]{1,8})`?[\s*_:`]*$/i;

function parseInfo(info: string): { lang: string; path?: string } {
	const tokens = info.trim().split(/\s+/).filter(Boolean);
	let lang = '';
	let path: string | undefined;
	for (const t of tokens) {
		const kv = /^(?:path|file|filename|name)=["']?([^"']+)["']?$/i.exec(t);
		if (kv) {
			path = kv[1];
			continue;
		}
		if (!lang && !FILENAME.test(t)) {
			lang = t.replace(/[{}]/g, '').toLowerCase();
			continue;
		}
		if (!path && FILENAME.test(t)) path = t;
	}
	if (!lang && path) lang = extensionOf(path);
	return { lang, path };
}

/** Parses fenced code blocks (``` and ~~~), tolerating a final unclosed fence from truncated output. */
export function parseBlocks(text: string): CodeBlock[] {
	const lines = text.split('\n');
	const blocks: CodeBlock[] = [];
	let i = 0;
	while (i < lines.length) {
		const open = FENCE_OPEN.exec(lines[i]);
		if (!open) {
			i++;
			continue;
		}
		const fence = open[1];
		const { lang, path: infoPath } = parseInfo(open[2]);
		let hint: string | undefined;
		for (let back = i - 1; back >= Math.max(0, i - 2); back--) {
			const prev = lines[back].trim();
			if (!prev) continue;
			const m = HINT.exec(prev);
			if (m) hint = m[1];
			break;
		}
		const body: string[] = [];
		let closed = false;
		let j = i + 1;
		const closeRe = new RegExp(`^ {0,3}${fence[0] === '`' ? '`' : '~'}{${fence.length},}\\s*$`);
		for (; j < lines.length; j++) {
			if (closeRe.test(lines[j])) {
				closed = true;
				break;
			}
			body.push(lines[j]);
		}
		blocks.push({
			lang,
			path: infoPath ?? hint,
			body: body.join('\n'),
			closed,
			index: blocks.length
		});
		i = j + 1;
	}
	return blocks;
}

/** `<file path="x">…</file>` blocks, an alternative some models prefer. */
function parseFileTags(text: string): CodeBlock[] {
	const out: CodeBlock[] = [];
	const re = /<file\s+(?:path|name)=["']([^"']+)["']\s*>\n?([\s\S]*?)<\/file>/g;
	for (const m of text.matchAll(re)) {
		out.push({
			lang: extensionOf(m[1]),
			path: m[1],
			body: m[2].replace(/\n$/, ''),
			closed: true,
			index: out.length
		});
	}
	return out;
}

/** Removes leaked reasoning (<think>…</think>) that some chat templates put into content. */
export function stripThinking(text: string): { content: string; reasoning: string | null } {
	const re = /^\s*<(think|thinking|reasoning)>([\s\S]*?)<\/\1>\s*/i;
	const m = re.exec(text);
	if (!m) return { content: text, reasoning: null };
	return { content: text.slice(m[0].length), reasoning: m[2].trim() };
}

function sameFile(a: string | undefined, b: string): boolean {
	if (!a) return false;
	const na = a.replace(/^\.?\//, '');
	return na === b || na.split('/').pop() === b.split('/').pop();
}

function blockKind(b: CodeBlock): string | undefined {
	if (b.path) return kindForPath(b.path);
	return b.lang ? kindForLanguage(b.lang) : undefined;
}

function largest(blocks: CodeBlock[]): CodeBlock | undefined {
	return blocks.reduce<CodeBlock | undefined>(
		(best, b) => (!best || b.body.length > best.body.length ? b : best),
		undefined
	);
}

/** Finds a document of the given kind in unfenced text (e.g. a bare <!DOCTYPE html>…). */
function rawDocument(text: string, kind: string): string | null {
	if (kind === 'html') {
		const start = text.search(/<!doctype html|<html[\s>]/i);
		if (start < 0) return null;
		const endTag = text.toLowerCase().lastIndexOf('</html>');
		return endTag > start ? text.slice(start, endTag + 7) : text.slice(start);
	}
	if (kind === 'svg') {
		const start = text.search(/<svg[\s>]/i);
		if (start < 0) return null;
		const endTag = text.toLowerCase().lastIndexOf('</svg>');
		const head = text.slice(0, start).match(/<\?xml[^>]*>\s*$/)?.[0] ?? '';
		return head + (endTag > start ? text.slice(start, endTag + 6) : text.slice(start));
	}
	return null;
}

function pickFor(file: OutputFile & { kind: string }, blocks: CodeBlock[], used: Set<number>) {
	const free = blocks.filter((b) => !used.has(b.index));
	const byPath = free.filter((b) => sameFile(b.path, file.path));
	if (byPath.length) return { block: largest(byPath)!, method: 'fence-path' };
	const ext = extensionOf(file.path);
	const byKind = free.filter(
		(b) => !b.path && (blockKind(b) === file.kind || (ext && b.lang === ext))
	);
	if (byKind.length) return { block: largest(byKind)!, method: 'fence-lang' };
	return null;
}

export function extractArtifacts(test: BenchTest, response: string): Extraction {
	const notes: string[] = [];
	const { content, reasoning } = stripThinking(response);
	if (reasoning) notes.push('stripped leaked <think> block from content');

	if (test.output.mode === 'text' || test.output.mode === 'workspace') {
		return {
			files: [
				{
					path: 'response.md',
					content: content.trim() + '\n',
					kind: 'markdown',
					declared: true,
					source: 'response'
				}
			],
			method: 'response',
			notes
		};
	}

	const blocks = [...parseBlocks(content), ...parseFileTags(content)].map((b, index) => ({
		...b,
		index
	}));
	const files: ExtractedFile[] = [];
	const used = new Set<number>();
	const methods: string[] = [];
	const declared = test.output.files.map((f) => ({ ...f, kind: f.kind ?? kindForPath(f.path) }));

	for (const file of declared) {
		const picked = pickFor(file, blocks, used);
		if (picked) {
			used.add(picked.block.index);
			methods.push(picked.method);
			if (!picked.block.closed)
				notes.push(`${file.path}: code block not closed — output probably truncated`);
			files.push({
				path: file.path,
				content: picked.block.body + '\n',
				kind: file.kind,
				declared: true,
				source: 'fence'
			});
			continue;
		}
		// A single expected file may also arrive bare, without any fence.
		if (declared.length === 1) {
			const raw = rawDocument(content, file.kind);
			const unfenced = blocks.length === 0 ? content.trim() : null;
			const untagged = blocks.filter((b) => !b.lang && !b.path);
			const body = raw ?? (untagged.length === 1 ? untagged[0].body : unfenced);
			if (body) {
				methods.push(
					raw ? 'raw-document' : untagged.length === 1 ? 'fence-untagged' : 'raw-response'
				);
				files.push({
					path: file.path,
					content: body.trimEnd() + '\n',
					kind: file.kind,
					declared: true,
					source: 'response'
				});
				continue;
			}
		}
		if (file.required !== false) notes.push(`missing required file: ${file.path}`);
	}

	// Extra files the model chose to add, if it named them.
	for (const b of blocks) {
		if (used.has(b.index) || !b.path) continue;
		const safe = safeRelative(b.path);
		if (!safe || files.some((f) => f.path === safe)) continue;
		used.add(b.index);
		files.push({
			path: safe,
			content: b.body + '\n',
			kind: kindForPath(safe),
			declared: false,
			source: 'file-block'
		});
	}

	return { files, method: [...new Set(methods)].join('+') || 'none', notes };
}
