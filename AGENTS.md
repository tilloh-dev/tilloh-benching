# AGENTS.md — Benchy

Guidance for AI agents (Claude Code, OpenCode, …) working in this repository. User-facing docs are in [README.md](README.md).

## Project

Benchy benchmarks **blueprints** (a model plus its settings) against **bench tests** (prompt, expected files, checks, judge criteria). Each attempt is generated, extracted, checked automatically and scored by an independent `claude -p` judge. Results are plain files under `data/runs/`. **BenchyOS** is a Svelte 5 SPA shaped like a desktop OS; the same build serves the live app and the static export.

Target platform: Debian-based Linux (native or WSL) with Node 24, pnpm and Claude Code. Everything in the repository is English.

## Layout

```
bin/benchy                 CLI entry (Node runs the TypeScript directly)
src/cli/                   commands: serve, run, judge, list, criteria, import-*, export, doctor
src/server/app.ts          Hono API, SSE event stream, /files (sandboxed), SPA hosting
src/engine/                framework-free engine shared by CLI and server
  core/                    zod schemas, library loader (YAML, extends, hashes), settings, scoring, kinds
  store/                   run/attempt files, in-memory index
  run/                     Engine (orchestration, resume, locks), preflight, host info
  subjects/                llama-cpp, openai-compatible, claude-code, dry-run
  llama/                   llama-server manager (linux | wsl-exe), router preset writer
  artifacts/               prompt building, extraction of files from responses
  checks/                  output.files, html.*, svg.render, model3d.render, program.run, json.parse, text.stats
  judge/                   charter, blind workspace, claude -p judge, criteria suggestions
  legacy/                  llm-check and router-preset importers
  export/                  static export
src/lib/                   BenchyOS: os/ (window manager, shell), apps/, viewers/, ui/, data/
library/                   authored blueprints, tests, suites (tracked)
data/runs/                 results (tracked); data/.cache is not
tests/                     Vitest, including a real dry-run pipeline
```

## Rules that keep Benchy correct

- **Engine code runs on Node without a build.** Relative imports carry `.ts`, only erasable TypeScript (no `enum`, no parameter properties, no namespaces), `import type` for types. The UI imports engine code only from `core/` (isomorphic files) and type-only elsewhere.
- **Files are the source of truth.** Never add a database. The index is rebuilt from `data/runs`; write JSON with `writeJson`/`writeFileAtomic`.
- **Status values are exactly** `ok | warnings | broken | failed`. Adding one means updating `overallStatus`, the UI `Status` component and the leaderboard.
- **Scores are computed by Benchy**, never taken from the judge: criterion scores 0–10, weighted to 0–100, `required` below 5 fails the gate (`core/scoring.ts`).
- **The dry-run subject and dry-run judge never touch the network.** They make the pipeline testable in CI.
- **llama-server is only started locally and only stopped by its own PID.** Never kill by image name (`taskkill /IM`) — that also kills the person's own router. If another llama-server runs, refuse; do not stop it.
- **`claude -p` must stay isolated** from the person's setup: `--safe-mode` or `--restricted`, always `--strict-mcp-config`, and a working directory outside the repository (Claude Code discovers `CLAUDE.md` and `.claude/` by walking up). The judge must not learn which model produced a submission.
- **Generated artifacts are untrusted.** Programs run only via `program.run` in bubblewrap without network. HTML runs only in `sandbox="allow-scripts"` iframes and behind the `/files` CSP sandbox header.
- **Hashes decide comparability.** `blueprintHash` ignores cosmetic fields; `testHashes` separates task, rubric and checks. Changing what goes into a hash changes every leaderboard grouping — do it deliberately.

## Gates before every commit

```bash
pnpm check     # 0 errors, 0 warnings
pnpm test
pnpm lint
pnpm build
```

Every test uses the phase markers `// arrange`, `// act`, `// assume` (lowercase). Never weaken or skip a test to get a green run.

## Common tasks

| Task | Where |
|---|---|
| New check | `src/engine/checks/<name>.ts` implementing `CheckImpl`, register in `checks/index.ts`, optionally add it to a kind's `defaultChecks` in `core/kinds.ts` |
| New artifact kind | `core/kinds.ts` (extensions, fence languages, viewer, default checks); viewer in `src/lib/viewers/ArtifactPreview.svelte` |
| New blueprint kind | schema in `core/schema.ts`, subject in `src/engine/subjects/`, wire it in `Engine.#subjectFor`, preflight item, Blueprints app form |
| New BenchyOS app | component in `src/lib/apps/`, entry in `src/lib/apps/registry.ts`; mark it `liveOnly` if it edits or runs anything |
| New test for the library | `library/tests/NN-slug/` with `test.yaml` and `prompt.md`; run `./bin/benchy list tests` — there must be no library issues. The `create-prompt` skill does this. |

## Do not

- Commit `.env`, `benchy.local.yaml` or `data/.cache/`.
- Bind the server to anything but `127.0.0.1` by default — the API starts processes.
- Add SSH or any remote control of other hosts. Benchy controls only the host it runs on.
- Put formatting rules into prompts ("Output ONLY the HTML"); Benchy's output contract in `artifacts/prompt.ts` handles that.
