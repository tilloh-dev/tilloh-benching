import { describe, expect, it } from 'vitest';
import { checkExpectation, planFor } from '../../src/engine/checks/program.ts';

const out = (
	p: Partial<{ code: number | null; stdout: string; stderr: string; ms: number; timedOut: boolean }>
) => ({
	code: 0,
	signal: null,
	stdout: '',
	stderr: '',
	ms: 5,
	timedOut: false,
	...p
});

describe('program checks', () => {
	it('derives compile and run commands from the file type', () => {
		// act / assume
		expect(planFor('main.py', {}).run).toEqual(['python3', 'main.py']);
		expect(planFor('main.c', {}).compile?.[0]).toBe('gcc');
		expect(planFor('x.rs', {}).run).toEqual(['./prog']);
		expect(planFor('a.py', { cmd: ['python3', '-O', 'a.py'] }).run).toEqual([
			'python3',
			'-O',
			'a.py'
		]);
	});

	it('passes when every expectation holds', () => {
		// act
		const issues = checkExpectation(
			out({ stdout: 'a 2\nb 1\n' }),
			{
				exit_code: 0,
				stdout_equals: 'a 2\nb 1',
				stdout_contains: ['a 2'],
				stdout_matches: '^b \\d$'
			},
			'c'
		);

		// assume
		expect(issues).toEqual([]);
	});

	it('reports exit code, output mismatches and timeouts', () => {
		// act
		const issues = checkExpectation(
			out({ code: 1, stdout: 'x', timedOut: true, stderr: 'boom' }),
			{ exit_code: 0, stdout_equals: 'y', stderr_empty: true },
			'c'
		);

		// assume
		expect(issues.map((i) => i.kind)).toEqual(['timeout', 'stdout', 'stderr']);
	});
});
