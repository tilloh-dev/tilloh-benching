<script lang="ts">
	/** Benchy mark: a bench with a spark — the yellow glows. */
	let { size = 22, glow = true }: { size?: number; glow?: boolean } = $props();
</script>

<svg class="logo" class:glow width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
	<defs>
		<linearGradient id="bl-seat" x1="0" y1="0" x2="0" y2="1">
			<stop offset="0" stop-color="#ffe98f" />
			<stop offset="1" stop-color="#ffc21a" />
		</linearGradient>
	</defs>
	<rect x="4" y="13" width="24" height="4.2" rx="2.1" fill="url(#bl-seat)" />
	<rect x="6" y="8" width="20" height="3" rx="1.5" fill="#ffd23f" opacity=".55" />
	<rect x="7.5" y="17" width="3" height="9" rx="1.2" fill="#e9edff" />
	<rect x="21.5" y="17" width="3" height="9" rx="1.2" fill="#e9edff" />
	<rect x="7.5" y="21" width="17" height="2.4" rx="1.2" fill="#b3bce3" />
	<path d="M16 1.5l1.1 3.1 3.1 1.1-3.1 1.1L16 9.9l-1.1-3.1-3.1-1.1 3.1-1.1z" fill="#fff5c4" />
</svg>

<style>
	.logo {
		flex: none;
	}
	.glow {
		filter: drop-shadow(0 0 6px rgba(255, 210, 63, 0.55));
	}
</style>
