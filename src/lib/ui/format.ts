export function fmtDuration(ms: number | null | undefined): string {
	if (ms == null) return '—';
	if (ms < 1000) return `${ms} ms`;
	const s = ms / 1000;
	if (s < 60) return `${s.toFixed(1)} s`;
	const m = Math.floor(s / 60);
	return `${m}m ${Math.round(s % 60)}s`;
}

export function fmtDate(iso: string | null | undefined): string {
	if (!iso) return '—';
	const d = new Date(iso);
	return d.toLocaleString([], {
		year: 'numeric',
		month: 'short',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit'
	});
}

export function fmtAgo(iso: string | null | undefined): string {
	if (!iso) return '—';
	const s = (Date.now() - new Date(iso).getTime()) / 1000;
	if (s < 60) return 'just now';
	if (s < 3600) return `${Math.floor(s / 60)} min ago`;
	if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
	return `${Math.floor(s / 86400)} d ago`;
}

export function fmtNum(n: number | null | undefined, digits = 1): string {
	if (n == null) return '—';
	return n.toLocaleString([], { maximumFractionDigits: digits });
}

export function fmtCost(n: number | null | undefined): string {
	if (n == null) return '—';
	if (n === 0) return '$0';
	return n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`;
}

/** Score → colour, the same scale as the Score component. */
export function scoreHue(v: number): number {
	return (v < 50 ? 350 + (v / 50) * 60 : 45 + ((v - 50) / 50) * 120) % 360;
}
