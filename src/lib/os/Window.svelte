<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from './Icon.svelte';
	import { desktopBounds, wm, type Win } from './wm.svelte.ts';

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
				ev.clientY <= b.y + 2
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

	/** Where the minimize animation flies to: this window's taskbar button. */
	const minimizeTarget = $derived.by(() => {
		if (win.phase !== 'minimizing' && win.phase !== 'restoring') return '';
		const btn = document.querySelector(`[data-taskbar="${win.id}"]`) as HTMLElement | null;
		if (!btn) return 'translate(0, 60vh) scale(0.2)';
		const r = btn.getBoundingClientRect();
		const tx = r.left + r.width / 2 - (win.x + win.w / 2);
		const ty = r.top + r.height / 2 - (win.y + win.h / 2);
		return `translate(${tx}px, ${ty}px) scale(${Math.max(0.08, r.width / win.w)}, ${Math.max(0.05, r.height / win.h)})`;
	});
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
	style="left:{win.x}px; top:{win.y}px; width:{win.w}px; height:{win.h}px; z-index:{win.z}; --fly:{minimizeTarget ||
		'none'}"
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
		<span class="app-icon"><Icon name={win.icon} size={16} /></span>
		<span class="title ellipsis">{win.title}</span>
		{#if win.subtitle}<span class="subtitle ellipsis">{win.subtitle}</span>{/if}
		<span class="spacer"></span>
		<div class="controls">
			<button class="ctl" title="Minimize" onclick={() => wm.minimize(win.id)}
				><Icon name="minimize" size={14} /></button
			>
			<button
				class="ctl"
				title={win.state === 'maximized' ? 'Restore' : 'Maximize'}
				onclick={() => wm.toggleMax(win.id)}
			>
				<Icon name={win.state === 'maximized' ? 'restore' : 'maximize'} size={13} />
			</button>
			<button class="ctl close" title="Close" onclick={() => wm.close(win.id)}
				><Icon name="close" size={14} /></button
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
		background: var(--bg-2);
		border: 1px solid var(--line);
		border-radius: var(--radius-l);
		box-shadow: var(--shadow-window);
		overflow: hidden;
		transform-origin: 50% 60%;
		transition:
			box-shadow 0.2s,
			border-color 0.2s,
			left 0.22s var(--ease-out),
			top 0.22s var(--ease-out),
			width 0.22s var(--ease-out),
			height 0.22s var(--ease-out);
	}
	.window.dragging {
		transition: none;
		user-select: none;
	}
	.window.focused {
		border-color: var(--line-strong);
		box-shadow:
			var(--shadow-window),
			0 0 0 1px rgba(255, 210, 63, 0.12),
			0 0 40px rgba(255, 210, 63, 0.06);
	}
	.window.maximized {
		border-radius: var(--radius);
	}
	.window.hidden {
		visibility: hidden;
		pointer-events: none;
	}
	.phase-opening {
		animation: win-open 0.22s var(--ease-out) both;
	}
	.phase-closing {
		animation: win-close 0.17s ease-in both;
		pointer-events: none;
	}
	.phase-minimizing {
		animation: win-min 0.26s cubic-bezier(0.5, 0, 0.75, 0) both;
		pointer-events: none;
	}
	.phase-restoring {
		animation: win-restore 0.26s var(--ease-out) both;
	}
	@keyframes win-open {
		from {
			opacity: 0;
			transform: translateY(10px) scale(0.94);
		}
	}
	@keyframes win-close {
		to {
			opacity: 0;
			transform: translateY(6px) scale(0.95);
		}
	}
	@keyframes win-min {
		to {
			opacity: 0.2;
			transform: var(--fly);
		}
	}
	@keyframes win-restore {
		from {
			opacity: 0.2;
			transform: var(--fly);
		}
	}

	.titlebar {
		flex: none;
		display: flex;
		align-items: center;
		gap: 8px;
		height: 38px;
		padding: 0 6px 0 12px;
		cursor: default;
		user-select: none;
		touch-action: none;
		background:
			linear-gradient(180deg, rgba(255, 255, 255, 0.055), rgba(255, 255, 255, 0) 55%),
			linear-gradient(180deg, #16214a, #111a3b);
		border-bottom: 1px solid var(--line-soft);
		position: relative;
	}
	.focused .titlebar::after {
		content: '';
		position: absolute;
		left: 12px;
		right: 12px;
		bottom: -1px;
		height: 1px;
		background: linear-gradient(90deg, transparent, var(--yellow-a35), transparent);
	}
	.app-icon {
		display: grid;
		place-items: center;
		width: 22px;
		height: 22px;
		border-radius: 6px;
		background: var(--bg-4);
		color: var(--text);
		box-shadow: 0 1px 0 rgba(255, 255, 255, 0.08) inset;
	}
	.focused .app-icon {
		color: var(--yellow);
	}
	.title {
		font-weight: 600;
		font-size: 13px;
		color: var(--text);
	}
	.subtitle {
		font-size: 12px;
		color: var(--text-3);
	}
	.window:not(.focused) .title {
		color: var(--text-2);
	}
	.controls {
		display: flex;
		gap: 4px;
	}
	.ctl {
		display: grid;
		place-items: center;
		width: 26px;
		height: 24px;
		border-radius: 7px;
		border: 1px solid transparent;
		background: transparent;
		color: var(--text-3);
		cursor: pointer;
		transition:
			background 0.12s,
			color 0.12s,
			border-color 0.12s;
	}
	.ctl:hover {
		background: var(--bg-4);
		color: var(--text);
		border-color: var(--line);
	}
	.ctl.close:hover {
		background: #7a1c2b;
		border-color: #b3344a;
		color: #fff;
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
		left: 10px;
		right: 10px;
		height: 7px;
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
		top: 10px;
		bottom: 10px;
		width: 7px;
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
		width: 14px;
		height: 14px;
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
		border: 2px solid var(--yellow);
		background: var(--yellow-a10);
		border-radius: var(--radius-l);
		box-shadow: var(--glow);
		pointer-events: none;
		animation: fade-up 0.15s both;
	}
	.snap-hint.top {
		inset: calc(var(--topbar-h) + 6px) 6px calc(var(--taskbar-h) + 6px) 6px;
	}
	.snap-hint.left {
		top: calc(var(--topbar-h) + 6px);
		bottom: calc(var(--taskbar-h) + 6px);
		left: 6px;
		width: calc(50% - 9px);
	}
	.snap-hint.right {
		top: calc(var(--topbar-h) + 6px);
		bottom: calc(var(--taskbar-h) + 6px);
		right: 6px;
		width: calc(50% - 9px);
	}
</style>
