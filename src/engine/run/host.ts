import { arch, cpus, hostname, platform, release, totalmem } from 'node:os';
import type { HostInfo } from '../core/schema.ts';
import { execCapture, which } from '../util/exec.ts';
import { isWsl } from '../llama/platform.ts';

let cached: HostInfo | null = null;

export async function gpuInfo(): Promise<string[]> {
	const smi =
		(await which('nvidia-smi')) ?? ((await isWsl()) ? '/usr/lib/wsl/lib/nvidia-smi' : null);
	if (smi) {
		const r = await execCapture(
			smi,
			['--query-gpu=name,memory.total,driver_version', '--format=csv,noheader'],
			{ timeoutMs: 8000 }
		);
		const lines = r.stdout
			.split('\n')
			.map((l) => l.trim())
			.filter(Boolean);
		if (r.code === 0 && lines.length)
			return lines.map((l) => `NVIDIA ${l}`.replace(/^NVIDIA NVIDIA/, 'NVIDIA'));
	}
	if (await which('vulkaninfo')) {
		const r = await execCapture('vulkaninfo', ['--summary'], { timeoutMs: 8000 });
		const names = [...r.stdout.matchAll(/deviceName\s*=\s*(.+)/g)].map((m) => m[1].trim());
		if (names.length) return [...new Set(names)].map((n) => `Vulkan ${n}`);
	}
	const r = await execCapture('sh', [
		'-c',
		"lspci 2>/dev/null | grep -iE 'vga|3d|display' | sed 's/^[^:]*: //'"
	]);
	return r.stdout
		.split('\n')
		.map((l) => l.trim())
		.filter(Boolean);
}

export async function hostInfo(name: string): Promise<HostInfo> {
	if (cached && cached.name === name) return cached;
	const cpu = cpus();
	cached = {
		name,
		platform: platform(),
		release: release(),
		arch: arch(),
		node: process.versions.node,
		cpu: cpu[0]?.model?.trim() ?? 'unknown',
		cpus: cpu.length,
		mem_gb: Math.round(totalmem() / 1024 ** 3),
		wsl: await isWsl(),
		gpus: await gpuInfo()
	};
	return cached;
}

export function systemHostname(): string {
	return hostname();
}
