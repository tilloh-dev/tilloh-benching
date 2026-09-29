import { defineConfig } from '@playwright/test';

const port = Number(process.env.BENCHY_E2E_PORT ?? 8788);

export default defineConfig({
	testDir: 'e2e',
	timeout: 60_000,
	use: { baseURL: `http://127.0.0.1:${port}`, viewport: { width: 1440, height: 900 } },
	webServer: {
		command: `node src/cli/main.ts serve --port ${port} --root tests/fixtures/workspace`,
		url: `http://127.0.0.1:${port}/api/health`,
		reuseExistingServer: !process.env.CI,
		timeout: 60_000
	}
});
