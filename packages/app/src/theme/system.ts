import { createSystem, defaultConfig, defineConfig } from '@chakra-ui/react';

const config = defineConfig({
	globalCss: {
		'html, body': {
			bg: '#09090b',
			color: '#e4e4e7',
			fontFamily: '"Geist", sans-serif',
			fontSize: '14px',
			lineHeight: '1.6',
		},
		'*': {
			borderColor: 'rgba(255, 255, 255, 0.06)',
		},
		'::-webkit-scrollbar': {
			width: '6px',
			height: '6px',
		},
		'::-webkit-scrollbar-track': {
			bg: 'transparent',
		},
		'::-webkit-scrollbar-thumb': {
			bg: 'rgba(255, 255, 255, 0.1)',
			borderRadius: '3px',
		},
		'::-webkit-scrollbar-thumb:hover': {
			bg: 'rgba(255, 255, 255, 0.2)',
		},
	},
	theme: {
		tokens: {
			colors: {
				warp: {
					50: { value: '#eef6ff' },
					100: { value: '#d9eaff' },
					200: { value: '#bcdaff' },
					300: { value: '#8ec3ff' },
					400: { value: '#59a2ff' },
					500: { value: '#3381ff' },
					600: { value: '#1b5ff5' },
					700: { value: '#144ae1' },
					800: { value: '#173db6' },
					900: { value: '#19388f' },
				},
				surface: {
					0: { value: '#09090b' },
					1: { value: '#0f0f12' },
					2: { value: '#18181b' },
					3: { value: '#1f1f23' },
					4: { value: '#27272a' },
				},
				accent: {
					cyan: { value: '#22d3ee' },
					violet: { value: '#a78bfa' },
					emerald: { value: '#34d399' },
					amber: { value: '#fbbf24' },
					rose: { value: '#fb7185' },
				},
			},
		},
	},
});

export const system = createSystem(defaultConfig, config);
