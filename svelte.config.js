import adapter from '@sveltejs/adapter-static';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		// Force runes mode for the project, except for libraries.
		runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
	},
	kit: {
		// BenchyOS is a single-page desktop. The same build is served by `benchy serve`
		// and copied verbatim by `benchy export`, so it must not need server rewrites.
		adapter: adapter({ pages: 'build/ui', assets: 'build/ui', fallback: 'index.html' }),
		router: { type: 'hash' },
		paths: { relative: true },
		alias: { $engine: 'src/engine' }
	}
};

export default config;
