# BenchyOS

BenchyOS benchmarks local and remote language models against your own prompts. Every result is stored as plain files and checked automatically. An independent Claude Code judge then scores it per criterion. BenchyOS, a desktop-style web UI, shows outputs, llama.cpp settings, run metadata and verdicts, and exports a read-only copy for sharing.

![One attempt: blueprint × test → generate → extract and check → judge → files, with re-judging as a loop](docs/assets/readme/attempt-pipeline.svg)

*Generating and judging are decoupled: a new rubric or judge model re-scores stored results without calling the model again.*

## Concepts

| Term | What it is | Where it lives |
|---|---|---|
| **Blueprint** | The thing under test: a model plus every setting that matters (llama-server flags, sampling, effort, system prompt). Versioned by a hash of its settings. | `library/blueprints/<id>.yaml` |
| **Bench test** | A prompt, the files you expect back, automated checks and the judge criteria. | `library/tests/<id>/test.yaml` + `prompt.md` |
| **Suite** | A named set of tests with default repetitions. | `library/suites/<id>.yaml` |
| **Run** | Blueprints × tests × repetitions, with snapshots of everything used. | `data/runs/<run-id>/` |
| **Attempt** | One blueprint × test × repetition: response, artifacts, evidence, checks, verdicts, your own rating. | `data/runs/<run-id>/<blueprint>/<test>/<rep>/` |

**Blueprint kinds**

- `llama-cpp` — BenchyOS starts llama-server on **this** host in router mode with a generated preset, one model at a time.
- `openai-compatible` — any `/chat/completions` API with a key from `.env`: OpenRouter, Ollama Cloud, OpenAI, vLLM, LM Studio.
- `claude-code` — `claude -p` as the subject, in `chat` mode (one answer, no tools) or `agentic` mode (writes files in a sandbox).
- `dry-run` — canned responses, including deliberately broken ones. No network, no model.

## Requirements

Debian-based Linux (Pop!_OS, Ubuntu, Debian, or WSL on Windows) with:

- **Node 24+** and **pnpm**
- **Claude Code**, logged in (`claude` on `PATH`) — the judge uses your subscription
- **bubblewrap** (`sudo apt install bubblewrap`) — sandbox for generated programs
- Optional: **llama.cpp** for local models, **openscad** for `.scad` 3D models

## Get started

1. Install dependencies and the headless browser the checks use:

   ```bash
   pnpm install
   pnpm exec playwright install chromium
   pnpm build
   ```

2. Configure this host. Copy the example and set the llama-server binary and models directory:

   ```bash
   cp benchy.local.yaml.example benchy.local.yaml
   cp .env.example .env        # only for API blueprints
   ```

3. Check the host:

   ```bash
   ./bin/benchy doctor --probe
   ```

   `--probe` makes one tiny `claude -p` call to prove the login works.

4. Run the smoke suite without any model or cost:

   ```bash
   ./bin/benchy run -s smoke -b dry-run --judge dry-run
   ```

5. Open BenchyOS:

   ```bash
   ./bin/benchy serve        # http://127.0.0.1:8787
   ```

> [!IMPORTANT]
> Keep `server.bind` at `127.0.0.1`. The API starts processes (llama-server, `claude -p`, sandboxed programs) and has no authentication.

## Run local models

BenchyOS only ever controls llama-server on the machine it runs on. On **hermine** it runs inside WSL and drives the Windows CUDA build. On **Gertrude** it drives the native Vulkan build.

1. Import your router preset once. Every `[section]` becomes a blueprint:

   ```bash
   ./bin/benchy import-preset ~/tooling/llama.cpp/presets/models.ini --strip-models-dir
   ```

2. Make variants in the Blueprints app with **Derive**. A derived blueprint uses `extends` and only lists what differs, for example `reasoning-effort: high` or `cache-type-k: q4_0`.

3. Start a run from **New run** or the CLI:

   ```bash
   ./bin/benchy run -s html-classics -b Qwen3.6-27B -b gemma-4-31B
   ```

**How BenchyOS handles llama-server:**

- **Own instance on port 8099.** It writes a preset with one section per blueprint and runs `llama-server --models-preset … --models-max 1`. The router loads each model when its turn comes. Your own router on 8081 is never touched.
- **Refuses a busy GPU.** If any other llama-server runs, the preflight reports it and the run does not start.
- **Stops only its own process, by PID.** Under WSL that means `taskkill /PID`, never by image name.
- **Records the real settings.** Per blueprint it stores the preset section, the exact launch argv from the router, `/props`, the build, the GPU and the timings (prompt and generation t/s, draft acceptance).

Relative model paths resolve against `llama.models_dir`, so one blueprint works on both hosts.

## Judging

A **judge profile** says who judges and how: `library/judges/<id>.yaml`, edited in the Judge app under **Profiles**. The default is `opus-xhigh`: `claude -p` with `claude-opus-5-5` at effort `xhigh`. Set another default with `judge.default_profile` in `benchy.config.yaml`.

| Kind | Judges with | Depth |
|---|---|---|
| `claude` | `claude -p` on your subscription | per test: static or interactive |
| `openai-compatible` | any `/chat/completions` API (OpenRouter, OpenAI, Ollama Cloud, vLLM …), key from `.env` | always static: code, check results and screenshots in one message |
| `dry-run` | deterministic scores from the checks | no model, no cost |

- **Isolated from your setup.** `--safe-mode` (static) or `--restricted` (interactive) with `--strict-mcp-config`: your CLAUDE.md, hooks, skills and MCP servers do not reach the judge.
- **Blind.** It works in a neutral temp directory: task, criteria, submission, screenshots and check logs. Nothing names the model.
- **Structured.** A JSON schema forces a score, rationale and evidence per criterion. BenchyOS computes the 0–100 score from the weights. A `required` criterion below 5/10 fails the attempt's gate.
- **Two depths per test.** `static` reads code, screenshots and logs. `interactive` also drives the page with Playwright MCP and may run programs with sandboxed Bash. Interactive is more thorough and much slower.

**One vote each.** An attempt's score is the mean of the latest score from every judge profile that scored it, plus your own rating from the attempt viewer's **Human** tab. The leaderboard ranks by that combined value. Expand an entry (▸) to see every judge's and your score as subrows. The entry with the most judge profiles sets the baseline. Entries judged by fewer profiles get a yellow ▲; hover it to see which profiles are missing.

Re-judge anything without regenerating:

```bash
./bin/benchy judge <run-id>                         # the run's judge, current rubric
./bin/benchy judge <run-id> --profile haiku-quick   # add a second opinion
./bin/benchy run -s smoke -b my-model --judge-profile openrouter-example
./bin/benchy criteria 09-violin-3d --write          # let Claude draft a rubric
```

The Judge app lists what the selected profile has not scored yet, and shows where you and the judges disagree.

### API keys

Set keys in BenchyOS under **Start → Settings**. They are written to `.env` in the BenchyOS root with file mode 600. BenchyOS refuses to write them if git does not ignore `.env` or tracks it. The UI and API only ever report a key's name, whether it is set and which blueprints and judges use it, never its value.

## Commands

| Command | Does |
|---|---|
| `benchy serve` | BenchyOS and API on localhost |
| `benchy run -s <suite> -b <blueprint>…` | Run, with preflight; hands off to a running server |
| `benchy judge <run\|attempt>… [--profile <id>]` | (Re-)judge stored attempts, optionally with another judge profile |
| `benchy resume <run> [--retry-failed]` | Continue an interrupted run; optionally regenerate failed attempts |
| `benchy recheck <run\|attempt>…` | Re-run the automated checks (fresh screenshots and logs) |
| `benchy list [blueprints\|tests\|suites\|judges\|runs\|checks]` | Show the library and library errors |
| `benchy criteria <test> [--write]` | Draft judge criteria with Claude |
| `benchy import-preset <models.ini> [--strip-models-dir]` | Blueprints from a llama-server router preset; relative model paths make them portable |
| `benchy import-legacy runs/ --preset <ini>` | Import llm-check results |
| `benchy export <dir>` | Read-only static site for sharing |
| `benchy doctor [--probe]` | Check Node, Chromium, bwrap, claude, llama-server, GPU, keys |

## Share results

```bash
./bin/benchy export ../benchy-site
python3 -m http.server --directory ../benchy-site 8000
```

The export is the same BenchyOS in read-only mode, plus JSON snapshots and every linked file. Host it on any static web server. It does not open from `file://`, because browsers block ES modules there.

## Checks

| Check | Runs on | What it does |
|---|---|---|
| `output.files` | every attempt | Declared files present, truncation, empty files |
| `html.parse` | HTML | parse5: doctype, structure, parse errors, duplicate ids |
| `html.render` | HTML | Chromium, network blocked: page/console errors, blocked requests, timed screenshots, scripted interactions |
| `svg.render` | SVG | Rendered screenshot, XML errors |
| `model3d.render` | OBJ, STL, glTF, PLY, OpenSCAD | three.js, four views, geometry stats |
| `program.run` | Python, Bash, JS/TS, C/C++, Rust, Go … | bubblewrap without network, cases with args, stdin and exact expectations |
| `json.parse`, `text.stats` | JSON, prose | Validity; words, headings, length limits |

The status per attempt is one of `ok`, `warnings`, `broken` or `failed` (nothing extracted or generation failed).

## Develop

```bash
pnpm dev        # API on :8787 + Vite on :5173 with hot reload
pnpm check      # svelte-check, 0 errors and 0 warnings
pnpm test       # Vitest, including the dry-run pipeline with Chromium
pnpm lint       # Prettier + ESLint
```

Contributor and agent conventions are in [AGENTS.md](AGENTS.md); the UI rules are in [docs/DESIGN.md](docs/DESIGN.md) and live in BenchyOS under **Start → Design system**. The top-bar theme switch cycles system → dark → light.

## How BenchyOS works

**1. Describe what you test.** A blueprint is a model with its settings, a bench test is a prompt with the files you expect, automated checks and judge criteria. Both are YAML files in `library/`, editable in BenchyOS.

**2. Start a run.** Pick blueprints, tests and a judge profile. The preflight checks llama-server, the GPU, API keys and the sandbox before anything is generated.

![New run: blueprints, tests and the judge profile](docs/assets/readme/launcher.png)

**3. BenchyOS generates, checks and judges.** It starts llama-server on this host if needed, stores the response and extracted files, renders and tests them, and hands the result to the judge without saying which model made it. Everything lands in `data/runs/` as plain files.

![Attempt viewer: combined score at the top, one judge's verdict per criterion below](docs/assets/readme/attempt-verdict.png)

**4. Add opinions.** Judge the same attempts with more profiles, and rate them yourself. Each profile and you count as one vote.

![Judge profiles: Opus 5.5 at xhigh is the default](docs/assets/readme/judge-profiles.png)

**5. Compare.** The leaderboard ranks by the combined score. Expand an entry for every judge's score. A yellow ▲ marks entries with fewer judge runs than the best-covered one.

![Leaderboard with judge subrows and the under-judged warning](docs/assets/readme/leaderboard.png)

**6. Keep it.** Commit `data/runs/` — the repository is the knowledge base. `benchy export` turns it into a read-only site to share.

![The BenchyOS desktop](docs/assets/readme/desktop.png)
