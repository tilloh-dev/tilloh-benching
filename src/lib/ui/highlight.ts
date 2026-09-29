import hljs from 'highlight.js/lib/core';
import xml from 'highlight.js/lib/languages/xml';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import css from 'highlight.js/lib/languages/css';
import python from 'highlight.js/lib/languages/python';
import bash from 'highlight.js/lib/languages/bash';
import json from 'highlight.js/lib/languages/json';
import yaml from 'highlight.js/lib/languages/yaml';
import markdown from 'highlight.js/lib/languages/markdown';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import rust from 'highlight.js/lib/languages/rust';
import go from 'highlight.js/lib/languages/go';
import ini from 'highlight.js/lib/languages/ini';

hljs.registerLanguage('xml', xml);
hljs.registerLanguage('html', xml);
hljs.registerLanguage('svg', xml);
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('css', css);
hljs.registerLanguage('python', python);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('json', json);
hljs.registerLanguage('yaml', yaml);
hljs.registerLanguage('markdown', markdown);
hljs.registerLanguage('c', c);
hljs.registerLanguage('cpp', cpp);
hljs.registerLanguage('rust', rust);
hljs.registerLanguage('go', go);
hljs.registerLanguage('ini', ini);

const BY_EXT: Record<string, string> = {
	html: 'html',
	htm: 'html',
	svg: 'xml',
	xml: 'xml',
	js: 'javascript',
	mjs: 'javascript',
	ts: 'typescript',
	css: 'css',
	py: 'python',
	sh: 'bash',
	bash: 'bash',
	json: 'json',
	yaml: 'yaml',
	yml: 'yaml',
	md: 'markdown',
	c: 'c',
	h: 'c',
	cpp: 'cpp',
	cc: 'cpp',
	rs: 'rust',
	go: 'go',
	ini: 'ini',
	toml: 'ini'
};

export function languageFor(path: string): string | null {
	const ext = path.split('.').pop()?.toLowerCase() ?? '';
	return BY_EXT[ext] ?? null;
}

/** HTML-escaped, highlighted code. Large inputs skip highlighting to stay responsive. */
export function highlight(code: string, lang: string | null): string {
	if (code.length > 400_000 || !lang || !hljs.getLanguage(lang)) {
		return code.replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[ch]!);
	}
	return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
}

export { hljs };
