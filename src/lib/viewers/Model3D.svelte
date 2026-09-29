<script lang="ts">
	import { onMount } from 'svelte';
	import type * as T from 'three';
	import Icon from '../os/Icon.svelte';

	let { src, format }: { src: string; format: string } = $props();
	let host: HTMLDivElement | undefined = $state();
	let canvas: HTMLCanvasElement | undefined = $state();
	let error = $state<string | null>(null);
	let stats = $state<{ vertices: number; triangles: number; size: string } | null>(null);
	let autoRotate = $state(true);
	let wireframe = $state(false);
	let api: {
		setAuto: (v: boolean) => void;
		setWire: (v: boolean) => void;
		reset: () => void;
	} | null = null;

	onMount(() => {
		let disposed = false;
		let cleanup = () => {};
		(async () => {
			const THREE = await import('three');
			const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js');
			const loaders = {
				obj: async () => new (await import('three/examples/jsm/loaders/OBJLoader.js')).OBJLoader(),
				stl: async () => new (await import('three/examples/jsm/loaders/STLLoader.js')).STLLoader(),
				ply: async () => new (await import('three/examples/jsm/loaders/PLYLoader.js')).PLYLoader(),
				gltf: async () =>
					new (await import('three/examples/jsm/loaders/GLTFLoader.js')).GLTFLoader(),
				glb: async () => new (await import('three/examples/jsm/loaders/GLTFLoader.js')).GLTFLoader()
			} as const;
			if (disposed || !host || !canvas) return;
			const make = loaders[format as keyof typeof loaders];
			if (!make) {
				error = `No viewer for .${format} — see the rendered views under Checks.`;
				return;
			}
			const renderer = new THREE.WebGLRenderer({ antialias: true, canvas });
			renderer.setPixelRatio(window.devicePixelRatio);
			const scene = new THREE.Scene();
			scene.background = new THREE.Color(0x080e22);
			scene.add(new THREE.HemisphereLight(0xe8ecff, 0x1b2759, 1.2));
			const key = new THREE.DirectionalLight(0xffffff, 1.7);
			key.position.set(3, 5, 4);
			scene.add(key);
			const rim = new THREE.DirectionalLight(0xffd23f, 0.8);
			rim.position.set(-4, 2, -3);
			scene.add(rim);
			const camera = new THREE.PerspectiveCamera(40, 1, 0.001, 1e6);
			const controls = new OrbitControls(camera, renderer.domElement);
			controls.enableDamping = true;
			controls.autoRotate = autoRotate;
			controls.autoRotateSpeed = 1.4;
			const mat = new THREE.MeshStandardMaterial({
				color: 0xc9d2ff,
				roughness: 0.55,
				metalness: 0.08,
				side: THREE.DoubleSide
			});
			const materials: T.Material[] = [mat];
			let object: T.Object3D;
			try {
				const loader = await make();
				const res: unknown = await (
					loader as { loadAsync: (u: string) => Promise<unknown> }
				).loadAsync(src);
				if ((res as { scene?: T.Object3D }).scene) object = (res as { scene: T.Object3D }).scene;
				else if ((res as T.BufferGeometry).isBufferGeometry) {
					const g = res as T.BufferGeometry;
					if (!g.attributes.normal) g.computeVertexNormals();
					object = new THREE.Mesh(g, mat);
				} else object = res as T.Object3D;
			} catch (e) {
				error = `Could not load the model: ${(e as Error).message}`;
				renderer.dispose();
				return;
			}
			let vertices = 0;
			let triangles = 0;
			object.traverse((o: T.Object3D) => {
				const m = o as T.Mesh;
				if (!m.isMesh) return;
				if (format !== 'gltf' && format !== 'glb') m.material = mat;
				else materials.push(...(Array.isArray(m.material) ? m.material : [m.material]));
				vertices += m.geometry.attributes.position?.count ?? 0;
				triangles += m.geometry.index
					? m.geometry.index.count / 3
					: (m.geometry.attributes.position?.count ?? 0) / 3;
			});
			scene.add(object);
			const box = new THREE.Box3().setFromObject(object);
			const size = box.getSize(new THREE.Vector3());
			const center = box.getCenter(new THREE.Vector3());
			stats = {
				vertices,
				triangles: Math.round(triangles),
				size: size
					.toArray()
					.map((v) => v.toFixed(2))
					.join(' × ')
			};
			const radius = Math.max(size.length() / 2, 1e-6);
			const grid = new THREE.GridHelper(radius * 4, 20, 0x34478f, 0x1a2654);
			grid.position.set(center.x, box.min.y, center.z);
			scene.add(grid);
			const dist = (radius / Math.sin(THREE.MathUtils.degToRad(20))) * 1.1;
			const home = () => {
				camera.position
					.copy(center)
					.add(new THREE.Vector3(1, 0.7, 1).normalize().multiplyScalar(dist));
				camera.near = dist / 100;
				camera.far = dist * 100;
				camera.updateProjectionMatrix();
				controls.target.copy(center);
			};
			home();
			const resize = () => {
				if (!host) return;
				const w = host.clientWidth;
				const h = host.clientHeight;
				renderer.setSize(w, h);
				camera.aspect = w / Math.max(h, 1);
				camera.updateProjectionMatrix();
			};
			const ro = new ResizeObserver(resize);
			ro.observe(host);
			resize();
			let raf = 0;
			const loop = () => {
				controls.update();
				renderer.render(scene, camera);
				raf = requestAnimationFrame(loop);
			};
			loop();
			api = {
				setAuto: (v) => (controls.autoRotate = v),
				setWire: (v) => {
					for (const m of materials) (m as T.MeshStandardMaterial).wireframe = v;
				},
				reset: home
			};
			cleanup = () => {
				cancelAnimationFrame(raf);
				ro.disconnect();
				controls.dispose();
				renderer.dispose();
			};
		})();
		return () => {
			disposed = true;
			cleanup();
		};
	});

	$effect(() => api?.setAuto(autoRotate));
	$effect(() => api?.setWire(wireframe));
</script>

<div class="viewer">
	<div class="bar">
		<Icon name="cube" size={12} />
		{#if stats}<span class="muted"
				>{stats.vertices.toLocaleString()} vertices · {stats.triangles.toLocaleString()} triangles · {stats.size}</span
			>{/if}
		<span class="spacer"></span>
		<button class="tb" class:on={autoRotate} onclick={() => (autoRotate = !autoRotate)}
			>rotate</button
		>
		<button class="tb" class:on={wireframe} onclick={() => (wireframe = !wireframe)}
			>wireframe</button
		>
		<button class="tb" onclick={() => api?.reset()}>reset</button>
		<a class="tb" href={src} download>download</a>
	</div>
	<div class="canvas" bind:this={host}>
		<canvas bind:this={canvas}></canvas>
		{#if error}<div class="err">{error}</div>{/if}
	</div>
</div>

<style>
	.viewer {
		display: flex;
		flex-direction: column;
		height: 100%;
		border: var(--bw) solid var(--line-soft);
		overflow: hidden;
	}
	.bar {
		flex: none;
		display: flex;
		align-items: center;
		gap: var(--sp-4);
		height: 34px;
		padding: 0 var(--sp-4) 0 var(--sp-5);
		background: var(--surface-2);
		border-bottom: var(--bw) solid var(--line-soft);
		font-size: var(--fs-s);
		color: var(--fg-2);
	}
	.tb {
		height: 24px;
		padding: 0 var(--sp-4);
		border: var(--bw) solid transparent;
		background: transparent;
		color: var(--fg-3);
		font-size: var(--fs-s);
		cursor: pointer;
		display: grid;
		place-items: center;
	}
	.tb:hover {
		background: var(--hover);
		color: var(--fg);
		text-decoration: none;
	}
	.tb.on {
		border-color: var(--line);
		color: var(--fg);
	}
	.canvas {
		position: relative;
		flex: 1;
		min-height: 0;
	}
	.canvas :global(canvas) {
		display: block;
	}
	.err {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		color: var(--fg-3);
		padding: var(--sp-7);
		text-align: center;
	}
</style>
