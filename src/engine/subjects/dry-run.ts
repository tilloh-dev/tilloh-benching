import { createHash } from 'node:crypto';
import { languageForPath, kindForPath } from '../core/kinds.ts';
import type { BenchTest } from '../core/schema.ts';
import { sleep } from '../util/time.ts';
import type { GenerateRequest, GenerateResult, Subject } from './types.ts';

/**
 * Deterministic canned responses. Never touches the network; this is what makes
 * the whole pipeline (extraction, checks, judge, dashboard) testable in CI.
 * `mixed` deliberately produces broken cases so every status shows up.
 */

type Variant = 'good' | 'runtime-error' | 'no-doctype' | 'truncated';

const HTML_GOOD = (title: string) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${title}</title>
<style>
  html, body { margin: 0; height: 100%; background: #0b1230; color: #e8ecff; font: 16px system-ui, sans-serif; }
  main { display: grid; place-items: center; height: 100%; }
  canvas { width: 320px; height: 320px; border-radius: 16px; box-shadow: 0 0 40px #ffd23f55; }
  h1 { font-weight: 600; letter-spacing: .02em; }
</style>
</head>
<body>
<main>
  <div>
    <h1>${title}</h1>
    <canvas id="c" width="320" height="320"></canvas>
    <p id="status">dry-run output</p>
  </div>
</main>
<script>
  const c = document.getElementById('c');
  const ctx = c.getContext('2d');
  let t = 0;
  function frame() {
    t += 0.02;
    ctx.fillStyle = '#121b45';
    ctx.fillRect(0, 0, 320, 320);
    for (let i = 0; i < 12; i++) {
      const a = t + i * Math.PI / 6;
      ctx.beginPath();
      ctx.arc(160 + Math.cos(a) * 110, 160 + Math.sin(a) * 110, 10 + 4 * Math.sin(t * 3 + i), 0, Math.PI * 2);
      ctx.fillStyle = i % 2 ? '#ffd23f' : '#5ee0c8';
      ctx.fill();
    }
    requestAnimationFrame(frame);
  }
  frame();
</script>
</body>
</html>`;

function htmlVariant(variant: Variant, title: string): string {
	const good = HTML_GOOD(title);
	switch (variant) {
		case 'good':
			return good;
		case 'runtime-error':
			return good.replace(
				'frame();\n</script>',
				'frame();\n  initAudioEngine(); // not defined\n</script>'
			);
		case 'no-doctype':
			return good
				.replace('<!DOCTYPE html>\n', '')
				.replace('<p id="status">dry-run output</p>', '<p id="status">dry-run output<p>');
		case 'truncated':
			return good.slice(0, Math.floor(good.length * 0.6));
	}
}

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="400" height="400">
  <rect width="200" height="200" fill="#0b1230"/>
  <circle cx="100" cy="100" r="70" fill="none" stroke="#ffd23f" stroke-width="6"/>
  <line x1="100" y1="100" x2="100" y2="45" stroke="#e8ecff" stroke-width="5" stroke-linecap="round"/>
  <line x1="100" y1="100" x2="140" y2="100" stroke="#5ee0c8" stroke-width="4" stroke-linecap="round"/>
</svg>`;

const OBJ_PYRAMID = `# dry-run pyramid
o pyramid
v -1 0 -1
v 1 0 -1
v 1 0 1
v -1 0 1
v 0 1.6 0
f 1 2 3
f 1 3 4
f 1 2 5
f 2 3 5
f 3 4 5
f 4 1 5
`;

const PY_GOOD = `import sys
from collections import Counter
import re

def main() -> None:
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 10
    words = re.findall(r"[a-z']+", sys.stdin.read().lower())
    counts = Counter(words)
    for word, count in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))[:n]:
        print(f"{word} {count}")

if __name__ == "__main__":
    main()
`;

const PY_BROKEN = `import sys

def main():
    words = sys.stdin.read().split()
    counts = {}
    for w in words:
        counts[w] += 1   # KeyError on first word
    print(counts)

main()
`;

const MARKDOWN = `# Why local models matter

Running language models on your own hardware changes the economics of experimentation.
Every prompt is free once the weights are downloaded, latency is predictable, and nothing
leaves the machine.

## Trade-offs

- **Quality:** the best open-weight models trail frontier APIs on hard reasoning.
- **Speed:** a single consumer GPU serves one request at a time.
- **Control:** you choose quantization, context length and sampling.

## Conclusion

Benchmark on the tasks you actually care about — that is the only leaderboard that matters.
`;

function contentFor(path: string, kind: string, variant: Variant, test: BenchTest): string {
	if (kind === 'html') return htmlVariant(variant, test.title);
	if (kind === 'svg') return variant === 'good' ? SVG : SVG.replace('</svg>', '');
	if (kind === 'model3d') return OBJ_PYRAMID;
	if (kind === 'markdown') return MARKDOWN;
	if (kind === 'program')
		return variant === 'good' || variant === 'no-doctype' ? PY_GOOD : PY_BROKEN;
	if (kind === 'json') return JSON.stringify({ dryRun: true, test: test.id }, null, 2);
	return `dry-run content for ${path}\n`;
}

function pickVariant(profile: string, seed: string): Variant {
	if (profile === 'good') return 'good';
	const n = parseInt(createHash('sha256').update(seed).digest('hex').slice(0, 8), 16);
	if (profile === 'broken') return (['runtime-error', 'no-doctype', 'truncated'] as const)[n % 3];
	return (['good', 'good', 'runtime-error', 'no-doctype', 'truncated'] as const)[n % 5];
}

export function dryRunResponse(test: BenchTest, profile: string, seed: string): string {
	const variant = pickVariant(profile, seed);
	if (test.output.mode === 'text' || test.output.files.length === 0) return MARKDOWN;
	const parts = ['Here is the result.\n'];
	for (const f of test.output.files) {
		const kind = f.kind ?? kindForPath(f.path);
		const body = contentFor(f.path, kind, variant, test);
		const lang = languageForPath(f.path);
		const info = test.output.mode === 'files' ? `${lang} path=${f.path}` : lang;
		const fenceClose = variant === 'truncated' && kind === 'html' ? '' : '\n```';
		parts.push(`\`\`\`${info}\n${body}${fenceClose}\n`);
	}
	return parts.join('\n');
}

export class DryRunSubject implements Subject {
	async generate(req: GenerateRequest): Promise<GenerateResult> {
		const profile = req.blueprint.dry_run?.profile ?? 'mixed';
		const delay = req.blueprint.dry_run?.delay_ms ?? 150;
		const seed = `${req.blueprint.id}:${req.test.id}:${req.rep}`;
		const started = performance.now();
		await sleep(delay, req.signal);
		const content = dryRunResponse(req.test, profile, seed);
		const tokens = Math.round(content.length / 4);
		const latency = Math.round(performance.now() - started);
		return {
			content,
			reasoning: 'Dry-run: no model was called. This reasoning text is canned.',
			raw: { dry_run: true, profile, seed },
			metrics: {
				latency_ms: latency,
				ttft_ms: Math.round(delay / 3),
				prompt_tokens: Math.round(req.messages.reduce((a, m) => a + m.content.length, 0) / 4),
				completion_tokens: tokens,
				reasoning_tokens: 14,
				gen_tps: Math.round((tokens / Math.max(latency, 1)) * 1000 * 10) / 10,
				tps_source: 'computed',
				cost_usd: 0,
				finish_reason: 'stop'
			}
		};
	}
}
