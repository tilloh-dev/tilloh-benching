import { expect, test, type Page } from '@playwright/test';

async function openApp(page: Page, name: string) {
	await page.getByRole('button', { name, exact: true }).first().dblclick();
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
	// arrange: one judged dry-run so every view has data
	const res = await request.post('/api/runs', {
		data: {
			spec: {
				label: 'e2e run',
				blueprints: ['e2e-good', 'e2e-mixed'],
				tests: ['page'],
				judge: { kind: 'dry-run' }
			},
			start: true
		}
	});
	expect(res.ok()).toBeTruthy();
	const { run } = await res.json();
	await expect
		.poll(async () => (await (await request.get(`/api/runs/${run.id}`)).json()).run.status, {
			timeout: 60_000
		})
		.toBe('done');
});

test('desktop boots with icons, taskbar and top bar', async ({ page }) => {
	// act
	await page.goto('/');

	// assume
	await expect(page.getByRole('navigation', { name: 'Desktop' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Start' })).toBeVisible();
	await expect(page.getByRole('dialog', { name: 'Welcome' })).toBeVisible();
	await expect(page.getByText('e2e-host').first()).toBeVisible();
});

test('leaderboard ranks the good blueprint first', async ({ page }) => {
	// arrange
	await page.goto('/#/?open=leaderboard');
	const board = page.getByRole('dialog', { name: 'Leaderboard' });

	// act
	const firstRow = board.locator('tbody tr').first();

	// assume
	await expect(firstRow).toContainText('E2E good');
	await board.getByRole('radio', { name: 'Matrix' }).click();
	await expect(board.getByText('overall')).toBeVisible();
});

test('run matrix opens an attempt with preview, checks and verdict', async ({ page }) => {
	// arrange
	await page.goto('/');
	await openApp(page, 'Runs');
	const runs = page.getByRole('dialog', { name: /Runs/ });
	await expect(runs.getByText('e2e run').first()).toBeVisible();

	// act
	await runs.locator('.rep').first().click();
	const attempt = page.getByRole('dialog', { name: /Tiny page/ });

	// assume
	await expect(attempt.locator('iframe')).toBeVisible();
	await attempt.getByRole('tab', { name: /Checks/ }).click();
	await expect(attempt.getByText('html.render').first()).toBeVisible();
	await attempt.getByRole('tab', { name: /Verdict/ }).click();
	await expect(attempt.getByText('Dry-run verdict', { exact: false })).toBeVisible();
});

test('windows minimize to the taskbar and restore', async ({ page }) => {
	// arrange
	await page.goto('/#/?open=host');
	const host = page.getByRole('dialog', { name: 'Host' });
	await expect(host).toBeVisible();

	// act
	await host.getByRole('button', { name: 'Minimize' }).click();
	await expect(host).toBeHidden();
	await page.locator('.taskbar').getByRole('button', { name: 'Host' }).click();

	// assume
	await expect(host).toBeVisible();
});

test('blueprint editor saves a derived variant', async ({ page, request }) => {
	// arrange
	await page.goto('/#/?open=blueprints');
	const win = page.getByRole('dialog', { name: 'Blueprints' });
	await win.getByRole('button', { name: /E2E good/ }).click();

	// act
	await win.getByTitle('Derive a variant (extends)').click();
	await win.getByRole('button', { name: 'Save' }).click();

	// assume
	await expect(page.getByText('Blueprint saved')).toBeVisible();
	const lib = await (await request.get('/api/library')).json();
	expect(lib.blueprints.map((b: { id: string }) => b.id)).toContain('e2e-good-variant');
	await request.delete('/api/blueprints/e2e-good-variant');
});
