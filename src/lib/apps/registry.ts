import type { AppDef } from '../os/wm.svelte.ts';
import Welcome from './Welcome.svelte';
import Leaderboard from './Leaderboard.svelte';
import Runs from './Runs.svelte';
import Launcher from './Launcher.svelte';
import Attempt from './Attempt.svelte';
import Blueprints from './Blueprints.svelte';
import Tests from './Tests.svelte';
import Suites from './Suites.svelte';
import Judge from './Judge.svelte';
import Host from './Host.svelte';
import Compare from './Compare.svelte';
import DesignSystem from './DesignSystem.svelte';

export const APPS: AppDef[] = [
	{
		id: 'welcome',
		title: 'Welcome',
		icon: 'home',
		component: Welcome as AppDef['component'],
		size: { w: 900, h: 640 },
		singleton: true,
		description: 'What BenchyOS is and where to start'
	},
	{
		id: 'leaderboard',
		title: 'Leaderboard',
		icon: 'trophy',
		component: Leaderboard as AppDef['component'],
		size: { w: 1120, h: 680 },
		singleton: true,
		description: 'Ranking, matrix and score × speed'
	},
	{
		id: 'runs',
		title: 'Runs',
		icon: 'rocket',
		component: Runs as AppDef['component'],
		size: { w: 1180, h: 720 },
		singleton: true,
		description: 'Live progress, logs and llama.cpp details'
	},
	{
		id: 'launcher',
		title: 'New run',
		icon: 'play',
		component: Launcher as AppDef['component'],
		size: { w: 1100, h: 660 },
		singleton: true,
		liveOnly: true,
		description: 'Blueprints × tests with preflight'
	},
	{
		id: 'blueprints',
		title: 'Blueprints',
		icon: 'blueprint',
		component: Blueprints as AppDef['component'],
		size: { w: 1100, h: 720 },
		singleton: true,
		description: 'Models and their settings'
	},
	{
		id: 'tests',
		title: 'Bench tests',
		icon: 'flask',
		component: Tests as AppDef['component'],
		size: { w: 1140, h: 740 },
		singleton: true,
		description: 'Prompts, checks and judge criteria'
	},
	{
		id: 'suites',
		title: 'Suites',
		icon: 'layers',
		component: Suites as AppDef['component'],
		size: { w: 900, h: 620 },
		singleton: true,
		description: 'Groups of tests'
	},
	{
		id: 'judge',
		title: 'Judge',
		icon: 'gavel',
		component: Judge as AppDef['component'],
		size: { w: 960, h: 640 },
		singleton: true,
		description: 'Queue, calibration against your ratings'
	},
	{
		id: 'compare',
		title: 'Compare',
		icon: 'compare',
		component: Compare as AppDef['component'],
		size: { w: 1280, h: 760 },
		singleton: true,
		description: 'Two attempts side by side'
	},
	{
		id: 'host',
		title: 'Host',
		icon: 'chip',
		component: Host as AppDef['component'],
		size: { w: 820, h: 620 },
		singleton: true,
		description: 'This machine, GPU and llama-server'
	},
	{
		id: 'design',
		title: 'Design system',
		icon: 'grid',
		component: DesignSystem as AppDef['component'],
		size: { w: 1200, h: 760 },
		singleton: true,
		description: 'Tokens, components and icons in both themes'
	},
	{
		id: 'attempt',
		title: 'Attempt',
		icon: 'eye',
		component: Attempt as AppDef['component'],
		size: { w: 1180, h: 780 },
		min: { w: 640, h: 420 },
		singleton: false,
		desktop: false
	}
];
