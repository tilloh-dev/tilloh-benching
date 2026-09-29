import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { streamChat } from '../../src/engine/subjects/openai-compatible.ts';

let server: Server;
let base = '';
let lastBody: Record<string, unknown> = {};
let lastAuth = '';

beforeAll(async () => {
	server = createServer((req, res) => {
		let body = '';
		req.on('data', (d) => (body += d));
		req.on('end', () => {
			lastBody = JSON.parse(body);
			lastAuth = req.headers.authorization ?? '';
			if ((lastBody.model as string) === 'fail') {
				res.writeHead(429, { 'content-type': 'application/json' }).end('{"error":"slow down"}');
				return;
			}
			res.writeHead(200, { 'content-type': 'text/event-stream' });
			const send = (o: unknown) => res.write(`data: ${JSON.stringify(o)}\n\n`);
			send({ model: 'served-name', choices: [{ delta: { reasoning_content: 'Let me think. ' } }] });
			send({ choices: [{ delta: { reasoning_content: 'Done.' } }] });
			send({ choices: [{ delta: { content: 'Hello' } }] });
			send({ choices: [{ delta: { content: ' world' }, finish_reason: 'stop' }] });
			send({
				choices: [],
				usage: { prompt_tokens: 12, completion_tokens: 7, total_tokens: 19, cost: 0.0012 },
				timings: {
					prompt_per_second: 812.34,
					predicted_per_second: 55.55,
					draft_n: 10,
					draft_n_accepted: 6
				}
			});
			res.end('data: [DONE]\n\n');
		});
	});
	await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
	const addr = server.address();
	base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}/v1`;
});

afterAll(() => server.close());

describe('streamChat', () => {
	it('collects content, reasoning, usage and llama.cpp timings from an SSE stream', async () => {
		// act
		const r = await streamChat({
			baseUrl: base,
			model: 'm',
			apiKey: 'sk-test',
			messages: [{ role: 'user', content: 'hi' }],
			body: { temperature: 0.2, max_tokens: 50 },
			timeoutMs: 5000,
			signal: new AbortController().signal
		});

		// assume
		expect(r.content).toBe('Hello world');
		expect(r.reasoning).toBe('Let me think. Done.');
		expect(r.metrics).toMatchObject({
			prompt_tokens: 12,
			completion_tokens: 7,
			prompt_tps: 812.3,
			gen_tps: 55.6,
			draft_n: 10,
			draft_accepted: 6,
			cost_usd: 0.0012,
			finish_reason: 'stop'
		});
		expect(r.metrics.ttft_ms).toBeTypeOf('number');
		expect(lastBody).toMatchObject({ model: 'm', temperature: 0.2, max_tokens: 50, stream: true });
		expect(lastAuth).toBe('Bearer sk-test');
		expect((r.raw as { served_model: string }).served_model).toBe('served-name');
	});

	it('turns HTTP errors into a SubjectError with the body', async () => {
		// act
		const p = streamChat({
			baseUrl: base,
			model: 'fail',
			messages: [],
			body: {},
			timeoutMs: 5000,
			signal: new AbortController().signal
		});

		// assume
		await expect(p).rejects.toThrow(/HTTP 429: .*slow down/);
	});
});
