import type { AttemptRow, RunRow } from '../core/rows.ts';
import type { LlamaStatus } from '../llama/manager.ts';

export type LogLevel = 'info' | 'warn' | 'error';

export type EngineEvent =
	| { type: 'run'; run: RunRow }
	| { type: 'attempt'; attempt: AttemptRow }
	| { type: 'log'; run_id: string | null; level: LogLevel; message: string; at: string }
	| { type: 'llama'; status: LlamaStatus }
	| { type: 'progress'; attempt_id: string; phase: 'reasoning' | 'content'; chars: number }
	| { type: 'library' }
	| { type: 'index' };
