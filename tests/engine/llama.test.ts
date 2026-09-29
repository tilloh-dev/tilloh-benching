import { describe, expect, it } from 'vitest';
import { iniValue, parseIni, presetSection, renderIni } from '../../src/engine/llama/preset.ts';
import {
	buildStartProcessCommand,
	modeFor,
	ownedFilter,
	parseTasklist,
	winArg
} from '../../src/engine/llama/manager.ts';
import { sectionToServer } from '../../src/engine/legacy/preset-import.ts';
import { resolveSettings } from '../../src/engine/core/settings.ts';

const INI = `# comment
[Qwen3.8-27B]
alias = qwen
model = /home/USER/.local/share/llama.cpp/models/q.gguf
ctx-size = 131000
flash-attn = on
jinja = true
temp = 1.0   ; inline comment
`;

describe('router preset', () => {
	it('parses sections, drops comments and types values on import', () => {
		// act
		const sections = parseIni(INI);
		const server = sectionToServer(sections['Qwen3.8-27B'], '/home/tim');

		// assume
		expect(server).toEqual({
			model: '/home/tim/.local/share/llama.cpp/models/q.gguf',
			'ctx-size': 131000,
			'flash-attn': 'on',
			jinja: true,
			temp: 1
		});
		expect(iniValue('0.95')).toBe(0.95);
		expect(iniValue('q8_0')).toBe('q8_0');
	});

	it('writes sections without reserved keys and resolves relative model paths', async () => {
		// arrange
		const bp = {
			id: 'qwen',
			kind: 'llama-cpp' as const,
			tags: [],
			request: {},
			server: { model: 'Qwen/q.gguf', alias: 'x', port: 9, jinja: true, 'ctx-size': 4096 }
		};

		// act
		const section = await presetSection(bp, {
			modelsDir: '/models',
			hostPath: async (p) => `C:${p}`
		});
		const ini = renderIni({ qwen: section }, 'generated');

		// assume
		expect(section).toEqual({ model: 'C:/models/Qwen/q.gguf', jinja: 'true', 'ctx-size': '4096' });
		expect(ini).toBe(
			'# generated\n\n[qwen]\nmodel = C:/models/Qwen/q.gguf\njinja = true\nctx-size = 4096\n'
		);
	});

	it('keeps Windows paths untouched', async () => {
		// act
		const section = await presetSection(
			{ id: 'w', kind: 'llama-cpp', tags: [], request: {}, server: { model: 'C:/Users/A/m.gguf' } },
			{ modelsDir: '/x', hostPath: async () => 'WRONG' }
		);

		// assume
		expect(section.model).toBe('C:/Users/A/m.gguf');
	});
});

describe('WSL → Windows process control', () => {
	it('picks wsl-exe for .exe binaries unless configured otherwise', () => {
		// arrange
		const s = resolveSettings({});

		// act / assume
		expect(modeFor('/mnt/c/x/llama-server.exe', s.llama.mode)).toBe('wsl-exe');
		expect(modeFor('/usr/bin/llama-server', s.llama.mode)).toBe('linux');
		expect(modeFor('/mnt/c/x/llama-server.exe', 'linux')).toBe('linux');
	});

	it('quotes arguments for Start-Process and PowerShell', () => {
		// act
		const cmd = buildStartProcessCommand({
			exe: "C:/Program Files/it's/llama-server.exe",
			args: ['--models-preset', 'C:/Users/A B/preset.ini', '--port', '8099'],
			workDir: 'C:/x',
			stdout: 'C:/o.log',
			stderr: 'C:/e.log'
		});

		// assume
		expect(winArg('C:/Users/A B/p.ini')).toBe('"C:/Users/A B/p.ini"');
		expect(winArg('plain')).toBe('plain');
		expect(cmd).toContain("-FilePath 'C:/Program Files/it''s/llama-server.exe'");
		expect(cmd).toContain(
			"-ArgumentList @('--models-preset','\"C:/Users/A B/preset.ini\"','--port','8099')"
		);
		expect(cmd).toContain('-PassThru; Write-Output $p.Id');
	});

	it('parses tasklist CSV output in any locale', () => {
		// act
		const pids = parseTasklist(
			'"llama-server.exe","1234","Console","1","1.234 K"\r\nINFORMATION: Es werden keine Aufgaben ausgeführt.\r\n"llama-server.exe","99","Console","1","5 K"'
		);

		// assume
		expect(pids).toEqual([1234, 99]);
	});

	it('treats the router and every descendant as ours', () => {
		// arrange
		const procs = [
			{ pid: 10, ppid: 1 },
			{ pid: 11, ppid: 10 },
			{ pid: 12, ppid: 11 },
			{ pid: 20, ppid: 1 }
		];

		// act / assume
		expect(ownedFilter(procs, 10).map((p) => p.pid)).toEqual([20]);
		expect(ownedFilter(procs, undefined)).toHaveLength(4);
	});
});

describe('portable preset import', () => {
	it('strips Linux and Windows models-dir prefixes from path keys only', () => {
		// act
		const linux = sectionToServer(
			{ model: '/home/USER/.local/share/llama.cpp/models/Q/q.gguf', 'ctx-size': '4096' },
			'/home/tim',
			true
		);
		const win = sectionToServer(
			{
				model: 'C:/Users/Anwender/AppData/Local/llama.cpp/models/Q/q.gguf',
				mmproj: 'C:/Users/Anwender/AppData/Local/llama.cpp/models/Q/mm.gguf'
			},
			undefined,
			true
		);

		// assume
		expect(linux).toEqual({ model: 'Q/q.gguf', 'ctx-size': 4096 });
		expect(win).toEqual({ model: 'Q/q.gguf', mmproj: 'Q/mm.gguf' });
	});
});
