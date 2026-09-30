<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from './Icon.svelte';
	import { desktopBounds, TOPBAR_H, wm, type Win } from './wm.svelte.ts';

	let { win, children }: { win: Win; children: Snippet } = $props();

	const focused = $derived(wm.focused?.id === win.id);
	let dragging = $state(false);
	let snapHint = $state<'left' | 'right' | 'top' | null>(null);

	function onTitleDown(e: PointerEvent) {
		if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
		wm.focus(win.id);
		const startX = e.clientX;
		const startY = e.clientY;
		let ox = win.x;
		let oy = win.y;
		let started = false;
		const el = e.currentTarget as HTMLElement;
		el.setPointerCapture(e.pointerId);
		const move = (ev: PointerEvent) => {
			const dx = ev.clientX - startX;
			const dy = ev.clientY - startY;
			if (!started) {
				if (Math.abs(dx) + Math.abs(dy) < 4) return;
				started = true;
				dragging = true;
				if (win.state === 'maximized') {
					// Pull out of maximize, keeping the cursor at the same relative spot.
					const r = win.restore ?? { x: win.x, y: win.y, w: 900, h: 620 };
					const rel = (startX - win.x) / win.w;
					wm.toggleMax(win.id);
					ox = startX - r.w * rel;
					oy = win.y;
				}
			}
			wm.move(win.id, ox + dx, oy + dy);
			const b = desktopBounds();
			snapHint =
				ev.clientY <= TOPBAR_H + 2
					? 'top'
					: ev.clientX <= 2
						? 'left'
						: ev.clientX >= b.w - 2
							? 'right'
							: null;
		};
		const up = () => {
			el.removeEventListener('pointermove', move);
			el.removeEventListener('pointerup', up);
			dragging = false;
			if (snapHint) wm.snap(win.id, snapHint);
			snapHint = null;
			wm.endInteraction(win.id);
		};
		el.addEventListener('pointermove', move);
		el.addEventListener('pointerup', up);
	}

	function onResizeDown(e: PointerEvent, dir: string) {
		if (e.button !== 0 || win.state === 'maximized') return;
		e.stopPropagation();
		wm.focus(win.id);
		const start = { x: e.clientX, y: e.clientY, wx: win.x, wy: win.y, ww: win.w, wh: win.h };
		const el = e.currentTarget as HTMLElement;
		el.setPointerCapture(e.pointerId);
		dragging = true;
		const move = (ev: PointerEvent) => {
			const dx = ev.clientX - start.x;
			const dy = ev.clientY - start.y;
			const g: { x?: number; y?: number; w?: number; h?: number } = {};
			if (dir.includes('e')) g.w = start.ww + dx;
			if (dir.includes('s')) g.h = start.wh + dy;
			if (dir.includes('w')) {
				g.w = start.ww - dx;
				g.x = start.wx + Math.min(dx, start.ww - 360);
			}
			if (dir.includes('n')) {
				g.h = start.wh - dy;
				g.y = start.wy + Math.min(dy, start.wh - 240);
			}
			wm.resize(win.id, g);
		};
		const up = () => {
			el.removeEventListener('pointermove', move);
			el.removeEventListener('pointerup', up);
			dragging = false;
			wm.endInteraction(win.id);
		};
		el.addEventListener('pointermove', move);
		el.addEventListener('pointerup', up);
	}
</script>

{#if snapHint}
	<div class="snap-hint {snapHint}"></div>
{/if}

<div
	class="window phase-{win.phase}"
	class:focused
	class:dragging
	class:maximized={win.state === 'maximized'}
	class:hidden={win.state === 'minimized'}
	style="left:{win.x}px; top:{win.y}px; width:{win.w}px; height:{win.h}px; z-index:{win.z}"
	role="dialog"
	tabindex="-1"
	aria-label={win.title}
	onpointerdown={() => wm.focus(win.id)}
>
	<div
		class="titlebar"
		role="toolbar"
		tabindex="-1"
		aria-label="{win.title} title bar"
		onpointerdown={onTitleDown}
		ondblclick={() => wm.toggleMax(win.id)}
	>
		<span class="app-icon"><Icon name={win.icon} size={12} /></span>
		<span class="title ellipsis">{win.title}</span>
		{#if win.subtitle}<span class="subtitle ellipsis">{win.subtitle}</span>{/if}
		<span class="spacer"></span>
		<div class="controls">
			<button class="ctl" title="Minimize" onclick={() => wm.minimize(win.id)}
				><Icon name="minimize" size={12} mono /></button
			>
			<button
				class="ctl"
				title={win.state === 'maximized' ? 'Restore' : 'Maximize'}
				onclick={() => wm.toggleMax(win.id)}
			>
				<Icon name={win.state === 'maximized' ? 'restore' : 'maximize'} size={12} mono />
			</button>
			<button class="ctl close" title="Close" onclick={() => wm.close(win.id)}
				><Icon name="close" size={12} mono /></button
			>
		</div>
	</div>
	<div class="body">
		{@render children()}
	</div>
	{#if win.state !== 'maximized'}
		{#each ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as dir (dir)}
			<div
				class="rz rz-{dir}"
				onpointerdown={(e) => onResizeDown(e, dir)}
				role="presentation"
			></div>
		{/each}
	{/if}
</div>

<style>
	.window {
		position: absolute;
		display: flex;
		flex-direction: column;
		background: var(--surface);
		border: var(--bw) solid var(--line);
		overflow: hidden;
		transition:
			left var(--dur-3) var(--ease),
			top var(--dur-3) var(--ease),
			width var(--dur-3) var(--ease),
			height var(--dur-3) var(--ease);
	}
	.window.dragging {
		transition: none;
		user-select: none;
	}
	.window.focused {
		border-color: var(--line-strong);
	}
	.window.hidden {
		visibility: hidden;
		pointer-events: none;
	}
	/* Retro moments: windows unfold and fold in visible steps. */
	.phase-opening,
	.phase-restoring {
		animation: step-unfold var(--dur-3) steps(var(--steps)) both;
	}
	.phase-closing,
	.phase-minimizing {
		animation: step-fold var(--dur-3) steps(var(--steps)) both;
		pointer-events: none;
	}

	.titlebar {
		flex: none;
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		height: var(--titlebar-h);
		padding: 0 var(--sp-2) 0 var(--sp-4);
		background: var(--surface-2);
		border-bottom: var(--bw) solid var(--line);
		color: var(--fg-3);
		transition: background var(--dur-2);
		cursor: default;
		user-select: none;
		touch-action: none;
	}
	.focused .titlebar {
		background: var(--surface-3);
		border-bottom-color: var(--line-strong);
		color: var(--fg);
	}
	.window:not(.focused) .app-icon {
		opacity: 0.55;
	}
	.app-icon {
		display: grid;
		place-items: center;
		color: inherit;
	}
	.title {
		font-weight: var(--fw-strong);
		font-size: var(--fs-m);
	}
	.subtitle {
		font-size: var(--fs-s);
		color: var(--fg-3);
	}
	.controls {
		display: flex;
		gap: var(--sp-1);
	}
	.ctl {
		display: grid;
		place-items: center;
		width: 20px;
		height: 20px;
		padding: 0;
		line-height: 0;
		border: var(--bw) solid var(--line);
		background: var(--surface);
		color: var(--fg-3);
		cursor: pointer;
		transition:
			color var(--dur-1),
			border-color var(--dur-1);
	}
	.ctl :global(svg) {
		display: block;
	}
	.ctl:hover {
		color: var(--fg);
		border-color: var(--fg-3);
	}
	.ctl.close:hover {
		color: var(--bad);
		border-color: var(--bad);
	}
	.body {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		position: relative;
	}

	.rz {
		position: absolute;
		z-index: 5;
	}
	.rz-n,
	.rz-s {
		left: 8px;
		right: 8px;
		height: 6px;
		cursor: ns-resize;
	}
	.rz-n {
		top: -3px;
	}
	.rz-s {
		bottom: -3px;
	}
	.rz-e,
	.rz-w {
		top: 8px;
		bottom: 8px;
		width: 6px;
		cursor: ew-resize;
	}
	.rz-e {
		right: -3px;
	}
	.rz-w {
		left: -3px;
	}
	.rz-ne,
	.rz-nw,
	.rz-se,
	.rz-sw {
		width: 12px;
		height: 12px;
	}
	.rz-ne {
		top: -3px;
		right: -3px;
		cursor: nesw-resize;
	}
	.rz-sw {
		bottom: -3px;
		left: -3px;
		cursor: nesw-resize;
	}
	.rz-nw {
		top: -3px;
		left: -3px;
		cursor: nwse-resize;
	}
	.rz-se {
		bottom: -3px;
		right: -3px;
		cursor: nwse-resize;
	}

	.snap-hint {
		position: fixed;
		z-index: 9000;
		border: var(--bw) dashed var(--fg-3);
		pointer-events: none;
	}
	.snap-hint.top {
		inset: var(--topbar-h) 0 var(--taskbar-h) 0;
	}
	.snap-hint.left {
		top: var(--topbar-h);
		bottom: var(--taskbar-h);
		left: 0;
		width: 50%;
	}
	.snap-hint.right {
		top: var(--topbar-h);
		bottom: var(--taskbar-h);
		right: 0;
		width: 50%;
	}
</style>
