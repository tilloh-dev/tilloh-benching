const enabled = process.stdout.isTTY && !process.env.NO_COLOR;

const wrap = (code: string) => (s: string | number) =>
	enabled ? `\x1b[${code}m${s}\x1b[0m` : String(s);

export const c = {
	bold: wrap('1'),
	dim: wrap('2'),
	red: wrap('31'),
	green: wrap('32'),
	yellow: wrap('33'),
	blue: wrap('34'),
	cyan: wrap('36'),
	gray: wrap('90')
};

export function statusColor(status: string | null | undefined): string {
	switch (status) {
		case 'ok':
		case 'pass':
			return c.green(status);
		case 'warnings':
		case 'warn':
			return c.yellow(status);
		case 'broken':
		case 'fail':
		case 'failed':
		case 'error':
			return c.red(status);
		default:
			return c.gray(status ?? '—');
	}
}

// eslint-disable-next-line no-control-regex -- matching ANSI escapes is the point
const ANSI = /\x1b\[[0-9;]*m/g;

export function table(rows: (string | number | null | undefined)[][], header?: string[]): string {
	const all = header ? [header, ...rows] : rows;
	const cells = all.map((r) => r.map((v) => (v === null || v === undefined ? '—' : String(v))));
	const widths: number[] = [];
	for (const r of cells)
		r.forEach((v, i) => (widths[i] = Math.max(widths[i] ?? 0, v.replace(ANSI, '').length)));
	const line = (r: string[]) =>
		r.map((v, i) => v + ' '.repeat(widths[i] - v.replace(ANSI, '').length)).join('  ');
	const out = cells.map(line);
	if (header) out.splice(1, 0, widths.map((w) => '─'.repeat(w)).join('  '));
	return out.join('\n');
}

export function levelIcon(level: string): string {
	return level === 'ok' ? c.green('✔') : level === 'warn' ? c.yellow('!') : c.red('✘');
}
