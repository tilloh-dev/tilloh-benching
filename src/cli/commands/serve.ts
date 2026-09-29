import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { serve } from '@hono/node-server';
import { parse, REPO_ROOT } from '../args.ts';
import { c } from '../format.ts';
import { Engine } from '../../engine/run/engine.ts';
import { createApp } from '../../server/app.ts';

const HELP = `benchy serve — start BenchyOS (web UI + API)

      --port <n>      default: server.port from settings (8787)
      --bind <addr>   default: 127.0.0.1 (keep it local; the API can start processes)
      --api-only      do not serve the built UI (used by pnpm dev)`;

export default async function serveCmd(args: string[]): Promise<number> {
	const p = parse(
		args,
		{ port: { type: 'string' }, bind: { type: 'string' }, 'api-only': { type: 'boolean' } },
		HELP
	);
	if (!p) return 0;
	const engine = await Engine.open(p.values.root, { exclusive: true });
	const port = Number(p.values.port ?? engine.settings.server.port);
	const bind = (p.values.bind as string | undefined) ?? engine.settings.server.bind;
	const uiDir = join(REPO_ROOT, 'build', 'ui');
	const app = createApp(engine, { uiDir: p.values['api-only'] ? null : uiDir });
	const server = serve({ fetch: app.fetch, port, hostname: bind });
	const url = `http://${bind === '0.0.0.0' ? '127.0.0.1' : bind}:${port}`;
	console.log(`${c.bold('BenchyOS')} ${c.cyan(url)}  ${c.gray(`workspace ${engine.ws.root}`)}`);
	if (!p.values['api-only'] && !existsSync(join(uiDir, 'index.html'))) {
		console.log(c.yellow('UI not built yet — run `pnpm build` (or use `pnpm dev`).'));
	}
	engine.on('event', (e) => {
		if (e.type === 'log' && e.level !== 'info')
			console.log(`${e.level === 'error' ? c.red('error') : c.yellow('warn')} ${e.message}`);
	});
	await new Promise<void>((resolve) => {
		const stop = () => resolve();
		process.once('SIGINT', stop);
		process.once('SIGTERM', stop);
	});
	console.log(c.gray('\nshutting down…'));
	server.close();
	await engine.close();
	return 0;
}
