/** Score 0–100 → step 1–5 of the score scale (--score-1 … --score-5). */
export function scoreStep(value: number): 1 | 2 | 3 | 4 | 5 {
	if (value < 20) return 1;
	if (value < 40) return 2;
	if (value < 60) return 3;
	if (value < 80) return 4;
	return 5;
}

export function scoreColor(value: number | null | undefined): string {
	return value == null ? 'var(--fg-4)' : `var(--score-${scoreStep(value)})`;
}
