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

export const APPS: AppDef[] = [
	{
		id: 'welcome',
		title: 'Welcome',
		icon: 'home',
		hue: 45,
		component: Welcome as AppDef['component'],
		size: { w: 900, h: 640 },
		singleton: true,
		description: 'What Benchy is and where to start'
	},
	{
		id: 'leaderboard',
		title: 'Leaderboard',
		icon: 'trophy',
		hue: 42,
		component: Leaderboard as AppDef['component'],
		size: { w: 1120, h: 680 },
		singleton: true,
		description: 'Ranking, matrix and score × speed'
	},
	{
		id: 'runs',
		title: 'Runs',
		icon: 'rocket',
		hue: 265,
		component: Runs as AppDef['component'],
		size: { w: 1180, h: 720 },
		singleton: true,
		description: 'Live progress, logs and llama.cpp details'
	},
	{
		id: 'launcher',
		title: 'New run',
		icon: 'play',
		hue: 150,
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
		hue: 215,
		component: Blueprints as AppDef['component'],
		size: { w: 1100, h: 720 },
		singleton: true,
		description: 'Models and their settings'
	},
	{
		id: 'tests',
		title: 'Bench tests',
		icon: 'flask',
		hue: 175,
		component: Tests as AppDef['component'],
		size: { w: 1140, h: 740 },
		singleton: true,
		description: 'Prompts, checks and judge criteria'
	},
	{
		id: 'suites',
		title: 'Suites',
		icon: 'layers',
		hue: 195,
		component: Suites as AppDef['component'],
		size: { w: 900, h: 620 },
		singleton: true,
		description: 'Groups of tests'
	},
	{
		id: 'judge',
		title: 'Judge',
		icon: 'gavel',
		hue: 28,
		component: Judge as AppDef['component'],
		size: { w: 960, h: 640 },
		singleton: true,
		description: 'Queue, calibration against your ratings'
	},
	{
		id: 'compare',
		title: 'Compare',
		icon: 'compare',
		hue: 300,
		component: Compare as AppDef['component'],
		size: { w: 1280, h: 760 },
		singleton: true,
		description: 'Two attempts side by side'
	},
	{
		id: 'host',
		title: 'Host',
		icon: 'chip',
		hue: 120,
		component: Host as AppDef['component'],
		size: { w: 820, h: 620 },
		singleton: true,
		description: 'This machine, GPU and llama-server'
	},
	{
		id: 'attempt',
		title: 'Attempt',
		icon: 'eye',
		hue: 230,
		component: Attempt as AppDef['component'],
		size: { w: 1180, h: 780 },
		min: { w: 640, h: 420 },
		singleton: false,
		desktop: false
	}
];
