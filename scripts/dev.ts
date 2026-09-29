// pnpm dev: API server (benchy serve --api-only) + Vite dev server with proxy, in one terminal.
import { spawn } from 'node:child_process';

const apiPort = process.env.BENCHY_API_PORT ?? '8787';
const procs = [
	spawn(
		process.execPath,
		['src/cli/main.ts', 'serve', '--api-only', '--port', apiPort, ...process.argv.slice(2)],
		{ stdio: 'inherit' }
	),
	spawn('pnpm', ['exec', 'vite', 'dev'], {
		stdio: 'inherit',
		env: { ...process.env, BENCHY_API_PORT: apiPort }
	})
];
const stop = () => {
	for (const p of procs) p.kill('SIGINT');
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const p of procs) p.on('exit', (code) => code && stop());
