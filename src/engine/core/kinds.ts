/**
 * Artifact kind metadata. Isomorphic: the UI uses it to pick a viewer, the
 * engine uses it to classify extracted files and choose default checks.
 * Unknown files fall back to `text` (if they decode as UTF-8) or `binary`.
 */

export type KindInfo = {
	id: string;
	label: string;
	extensions: string[];
	/** Code-fence languages that identify this kind. */
	languages: string[];
	/** Checks applied when a test declares no `checks` of its own. */
	defaultChecks: string[];
	viewer:
		'html' | 'svg' | 'markdown' | 'code' | 'model3d' | 'program' | 'image' | 'text' | 'binary';
	/** Whether the judge should read the file as text. */
	textual: boolean;
};

export const KINDS: KindInfo[] = [
	{
		id: 'html',
		label: 'HTML page',
		extensions: ['html', 'htm'],
		languages: ['html', 'htm', 'xhtml'],
		defaultChecks: ['html.parse', 'html.render'],
		viewer: 'html',
		textual: true
	},
	{
		id: 'svg',
		label: 'SVG image',
		extensions: ['svg'],
		languages: ['svg', 'xml'],
		defaultChecks: ['svg.render'],
		viewer: 'svg',
		textual: true
	},
	{
		id: 'markdown',
		label: 'Markdown',
		extensions: ['md', 'markdown'],
		languages: ['markdown', 'md'],
		defaultChecks: ['text.stats'],
		viewer: 'markdown',
		textual: true
	},
	{
		id: 'model3d',
		label: '3D model',
		extensions: ['obj', 'stl', 'gltf', 'ply', 'scad'],
		languages: ['obj', 'stl', 'gltf', 'ply', 'scad', 'openscad'],
		defaultChecks: ['model3d.render'],
		viewer: 'model3d',
		textual: true
	},
	{
		id: 'program',
		label: 'Program',
		extensions: [
			'py',
			'sh',
			'bash',
			'js',
			'mjs',
			'ts',
			'c',
			'cpp',
			'cc',
			'go',
			'rs',
			'rb',
			'pl',
			'lua'
		],
		languages: [
			'python',
			'py',
			'bash',
			'sh',
			'shell',
			'javascript',
			'js',
			'typescript',
			'ts',
			'c',
			'cpp',
			'c++',
			'go',
			'rust',
			'rs',
			'ruby',
			'perl',
			'lua'
		],
		defaultChecks: [],
		viewer: 'program',
		textual: true
	},
	{
		id: 'json',
		label: 'JSON',
		extensions: ['json'],
		languages: ['json'],
		defaultChecks: ['json.parse'],
		viewer: 'code',
		textual: true
	},
	{
		id: 'code',
		label: 'Source file',
		extensions: [
			'css',
			'yaml',
			'yml',
			'toml',
			'xml',
			'sql',
			'java',
			'kt',
			'swift',
			'cs',
			'php',
			'csv'
		],
		languages: [
			'css',
			'yaml',
			'yml',
			'toml',
			'sql',
			'java',
			'kotlin',
			'swift',
			'csharp',
			'php',
			'csv'
		],
		defaultChecks: [],
		viewer: 'code',
		textual: true
	},
	{
		id: 'image',
		label: 'Image',
		extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'],
		languages: [],
		defaultChecks: [],
		viewer: 'image',
		textual: false
	},
	{
		id: 'text',
		label: 'Text',
		extensions: ['txt', 'log'],
		languages: ['text', 'txt', 'plaintext'],
		defaultChecks: ['text.stats'],
		viewer: 'text',
		textual: true
	},
	{
		id: 'binary',
		label: 'Binary file',
		extensions: [],
		languages: [],
		defaultChecks: [],
		viewer: 'binary',
		textual: false
	}
];

const BY_ID = new Map(KINDS.map((k) => [k.id, k]));

export function kindInfo(id: string): KindInfo {
	return BY_ID.get(id) ?? BY_ID.get('text')!;
}

export function extensionOf(path: string): string {
	const base = path.split('/').pop() ?? path;
	const dot = base.lastIndexOf('.');
	return dot > 0 ? base.slice(dot + 1).toLowerCase() : '';
}

export function kindForPath(path: string): string {
	const ext = extensionOf(path);
	if (!ext) return 'text';
	return KINDS.find((k) => k.extensions.includes(ext))?.id ?? 'text';
}

export function kindForLanguage(lang: string): string | undefined {
	const l = lang.toLowerCase();
	return KINDS.find((k) => k.languages.includes(l))?.id;
}

/** Language hint for a file, used when asking a model to emit it as a fenced block. */
export function languageForPath(path: string): string {
	const ext = extensionOf(path);
	const map: Record<string, string> = {
		py: 'python',
		sh: 'bash',
		js: 'javascript',
		mjs: 'javascript',
		ts: 'typescript',
		md: 'markdown',
		htm: 'html',
		yml: 'yaml',
		rs: 'rust',
		cc: 'cpp',
		scad: 'openscad'
	};
	return map[ext] ?? (ext || 'text');
}
