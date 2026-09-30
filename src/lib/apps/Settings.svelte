<script lang="ts">
	import type { SecretInfo } from '$engine/api-types.ts';
	import type { Win } from '../os/wm.svelte.ts';
	import { benchy } from '../data/store.svelte.ts';
	import { toasts } from '../os/toasts.svelte.ts';
	import Button from '../ui/Button.svelte';
	import Empty from '../ui/Empty.svelte';

	let { win: _win }: { win: Win } = $props();

	let secrets = $state<SecretInfo[] | null>(null);
	/** Typed values, cleared right after saving. Never filled from the server. */
	let values = $state<Record<string, string>>({});
	let newName = $state('');
	let busy = $state<string | null>(null);

	async function load() {
		try {
			secrets = await benchy.api.secrets();
		} catch (e) {
			toasts.error(e);
		}
	}
	$effect(() => {
		if (benchy.live) load();
	});

	async function save(name: string) {
		const value = values[name]?.trim();
		if (!value) return;
		busy = name;
		try {
			secrets = await benchy.api.setSecret(name, value);
			values[name] = '';
			newName = '';
			toasts.push('ok', `${name} saved`, 'Stored in .env — git-ignored, never shown again');
			benchy.setLibrary(await benchy.api.library());
		} catch (e) {
			toasts.error(e);
		} finally {
			busy = null;
		}
	}

	async function remove(name: string) {
		if (!confirm(`Remove ${name} from .env?`)) return;
		busy = name;
		try {
			secrets = await benchy.api.deleteSecret(name);
			benchy.setLibrary(await benchy.api.library());
		} catch (e) {
			toasts.error(e);
		} finally {
			busy = null;
		}
	}

	const validNew = $derived(/^[A-Z_][A-Z0-9_]*$/.test(newName));
</script>

<div class="body scroll">
	<h3 class="section-title">API keys</h3>
	<p class="hint">
		Keys go into <span class="mono">.env</span> in the BenchyOS root (file mode 600). BenchyOS refuses
		to write it unless git ignores it, and never sends a stored value back — this page only knows whether
		a key is set.
	</p>
	{#if !secrets}
		<Empty icon="gear" title="Loading…" />
	{:else}
		<table class="table">
			<thead>
				<tr><th>Variable</th><th>State</th><th>Used by</th><th>New value</th><th></th></tr>
			</thead>
			<tbody>
				{#each secrets as s (s.name)}
					<tr>
						<td class="mono">{s.name}</td>
						<td>
							{#if s.set}<span class="ok">● set</span>
								<span class="muted small">{s.source === 'environment' ? 'shell env' : '.env'}</span>
							{:else}<span class="muted">○ missing</span>{/if}
						</td>
						<td class="muted small ellipsis" style="max-width:260px" title={s.used_by.join(', ')}
							>{s.used_by.join(', ') || '—'}</td
						>
						<td>
							<form
								class="row"
								onsubmit={(e) => {
									e.preventDefault();
									save(s.name);
								}}
							>
								<input
									class="input mono"
									type="password"
									autocomplete="off"
									placeholder={s.set ? 'replace…' : 'paste key…'}
									aria-label="New value for {s.name}"
									bind:value={values[s.name]}
								/>
								<Button
									size="sm"
									variant="primary"
									icon="save"
									loading={busy === s.name}
									disabled={!values[s.name]?.trim()}
									onclick={() => save(s.name)}>Save</Button
								>
							</form>
						</td>
						<td
							>{#if s.source === 'env-file'}<Button
									size="sm"
									variant="ghost"
									icon="trash"
									onclick={() => remove(s.name)}
								/>{/if}</td
						>
					</tr>
				{/each}
			</tbody>
		</table>
		<form
			class="add row"
			onsubmit={(e) => {
				e.preventDefault();
				if (validNew) {
					values[newName] = values[newName] ?? '';
					save(newName);
				}
			}}
		>
			<input
				class="input mono"
				placeholder="OTHER_API_KEY"
				aria-label="New variable name"
				bind:value={newName}
			/>
			<input
				class="input mono"
				type="password"
				autocomplete="off"
				placeholder="value"
				aria-label="Value"
				disabled={!validNew}
				bind:value={values[newName]}
			/>
			<Button
				size="sm"
				icon="plus"
				disabled={!validNew || !values[newName]?.trim()}
				onclick={() => save(newName)}>Add key</Button
			>
		</form>
		<p class="hint">
			A key already set in the shell that started <span class="mono">benchy serve</span> wins over
			<span class="mono">.env</span> after a restart.
		</p>
	{/if}
</div>

<style>
	.body {
		flex: 1;
		padding: var(--sp-6);
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
	}
	.hint {
		margin: 0;
		font-size: var(--fs-s);
		color: var(--fg-3);
		max-width: 760px;
	}
	.ok {
		color: var(--ok);
	}
	.small {
		font-size: var(--fs-s);
	}
	.add {
		max-width: 760px;
	}
	.add .input,
	form.row .input {
		min-width: 0;
	}
</style>
