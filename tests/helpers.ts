import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { workspaceAt, type Workspace } from '../src/engine/core/workspace.ts';

/** Creates a throwaway workspace with the given files (paths relative to its root). */
export async function tempWorkspace(files: Record<string, string> = {}): Promise<Workspace> {
	const root = await mkdtemp(join(tmpdir(), 'benchy-test-'));
	for (const [rel, content] of Object.entries(files)) {
		const path = join(root, rel);
		await mkdir(dirname(path), { recursive: true });
		await writeFile(path, content);
	}
	return workspaceAt(root);
}
