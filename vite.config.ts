import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

const apiPort = Number(process.env.BENCHY_API_PORT ?? 8787);
const apiTarget = `http://127.0.0.1:${apiPort}`;

export default defineConfig({
	plugins: [sveltekit()],
	server: {
		port: 5173,
		proxy: {
			'/api': { target: apiTarget, changeOrigin: true },
			'/files': { target: apiTarget, changeOrigin: true }
		}
	},
	test: {
		include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
		environment: 'node',
		testTimeout: 30_000
	}
});
