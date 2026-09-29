<script lang="ts">
	import type { Win } from '../os/wm.svelte.ts';
	import { benchy } from '../data/store.svelte.ts';
	import Button from '../ui/Button.svelte';
	import Status from '../ui/Status.svelte';
	import Code from '../ui/Code.svelte';
	import Icon from '../os/Icon.svelte';

	let { win: _win }: { win: Win } = $props();

	let conflicts = $state<string[] | null>(null);
	let checking = $state(false);
	const host = $derived(benchy.status?.host);
	const engine = $derived(benchy.status?.engine);

	async function check() {
		checking = true;
		try {
			conflicts = (await benchy.api.conflicts()).conflicts;
		} finally {
			checking = false;
		}
	}

	const localExample = `# benchy.local.yaml — host-specific, not committed
host:
  name: hermine
llama:
  # WSL → Windows build (CUDA). Benchy starts it via PowerShell and stops it by PID.
  binary: /mnt/c/Users/<you>/tooling/llama.cpp/vendor/llama.cpp/llama-b10786/llama-server.exe
  models_dir: /mnt/c/Users/<you>/AppData/Local/llama.cpp/models
  port: 8099          # Benchy's own port — your router on 8081 is never touched`;
</script>

<div class="host scroll">
	{#if host}
		<section class="card hero">
			<div class="chip-ico"><Icon name="chip" size={30} /></div>
			<div class="grow">
				<h2>{host.name}</h2>
				<p class="muted">
					{host.platform}
					{host.release}{host.wsl ? ' · WSL' : ''} · {host.arch} · Node {host.node}
				</p>
				<p class="muted">{host.cpus}× {host.cpu} · {host.mem_gb} GB RAM</p>
			</div>
			<div class="gpus">
				{#each host.gpus as g (g)}<span class="gpu"><Icon name="flame" size={14} />{g}</span
					>{:else}<span class="muted">no GPU detected</span>{/each}
			</div>
		</section>
	{/if}

	{#if benchy.live && engine}
		<section class="card">
			<h4 class="section-title">llama-server</h4>
			<div class="row wrap">
				<Status
					status={engine.llama.state === 'ready'
						? 'ok'
						: engine.llama.state === 'error'
							? 'error'
							: engine.llama.state === 'stopped'
								? 'skipped'
								: 'running'}
					label={engine.llama.state}
				/>
				{#if engine.llama.mode}<span class="mono small">{engine.llama.mode}</span>{/if}
				{#if engine.llama.url}<span class="mono small">{engine.llama.url}</span>{/if}
				{#if engine.llama.loaded}<span class="small">loaded: <b>{engine.llama.loaded}</b></span
					>{/if}
				<span class="spacer"></span>
				<Button size="sm" icon="search" loading={checking} onclick={check}
					>Check for other llama-servers</Button
				>
			</div>
			{#if engine.llama.error}<p class="err">{engine.llama.error}</p>{/if}
			{#if conflicts !== null}
				{#if conflicts.length}
					<div class="conflicts">
						{#each conflicts as c (c)}<div><Icon name="alert" size={14} /> {c}</div>{/each}
						<p class="small">
							Benchy will not start its own server while these run (it only stops what it started).
						</p>
					</div>
				{:else}
					<p class="ok small">
						<Icon name="check" size={14} /> GPU free — no other llama-server is running.
					</p>
				{/if}
			{/if}
			<p class="hint">
				Benchy runs llama-server in router mode with a preset it generates per run (one section per
				blueprint, <code>--models-max 1</code>) on port
				<b>{benchy.status?.settings?.llama_port}</b>, and stops it when the run ends.
			</p>
		</section>
		<section class="card">
			<h4 class="section-title">Engine</h4>
			<div class="kv">
				<span>active runs</span><b
					>{engine.active_runs.length ? engine.active_runs.join(', ') : '—'}</b
				>
				<span>judge jobs</span><b>{engine.judge_jobs}</b>
				<span>judge</span><b
					>{benchy.status?.settings?.judge.model} @ {benchy.status?.settings?.judge.effort}</b
				>
				<span>event stream</span><b>{benchy.connected ? 'connected' : 'reconnecting…'}</b>
			</div>
		</section>
		<section class="card">
			<h4 class="section-title">Configure this host</h4>
			<p class="hint">
				Run <code>benchy doctor</code> in a terminal for a full check (Chromium, bubblewrap, claude login,
				llama-server, GPU, API keys).
			</p>
			<Code code={localExample} lang="yaml" lineNumbers={false} />
		</section>
	{:else if !benchy.live}
		<section class="card">
			<p class="muted">
				Static export — host details as of the export. Live status is only available in <code
					>benchy serve</code
				>.
			</p>
		</section>
	{/if}
</div>

<style>
	.host {
		flex: 1;
		padding: 14px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.hero {
		display: flex;
		gap: 16px;
		align-items: center;
		background:
			radial-gradient(80% 120% at 0% 0%, rgba(255, 210, 63, 0.08), transparent 60%), var(--bg-3);
	}
	.chip-ico {
		display: grid;
		place-items: center;
		width: 60px;
		height: 60px;
		border-radius: 16px;
		background: var(--bg-4);
		border: 1px solid var(--line-strong);
		box-shadow: var(--glow-soft);
	}
	h2 {
		margin: 0;
		font-size: 20px;
	}
	.hero p {
		margin: 2px 0 0;
		font-size: 12.5px;
	}
	.gpus {
		display: flex;
		flex-direction: column;
		gap: 4px;
		align-items: flex-end;
	}
	.gpu {
		display: inline-flex;
		gap: 6px;
		align-items: center;
		font-size: 12.5px;
		padding: 4px 10px;
		border-radius: 999px;
		border: 1px solid var(--yellow-a35);
		color: var(--yellow-2);
	}
	.small {
		font-size: 12px;
	}
	.err {
		color: var(--bad);
		white-space: pre-wrap;
		font-size: 12.5px;
	}
	.ok {
		color: var(--ok);
		--icon-accent: var(--ok);
	}
	.conflicts {
		margin-top: 8px;
		padding: 8px 10px;
		border-radius: 8px;
		border: 1px solid rgba(255, 181, 71, 0.4);
		color: var(--warn);
		font-size: 12.5px;
		--icon-accent: var(--warn);
	}
	.kv {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: 4px 16px;
		font-size: 12.5px;
	}
	.kv span {
		color: var(--text-3);
	}
	.kv b {
		font-weight: 500;
	}
	code {
		color: var(--yellow-2);
		font-size: 11.5px;
	}
</style>
