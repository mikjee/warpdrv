import { defineConfig } from 'vite';
import path from 'path';
import react from '@vitejs/plugin-react';

export default defineConfig({
	plugins: [react()],
	resolve: {
		alias: {
			'@': path.resolve(__dirname, './src'),
		},
	},
	server: {
		port: 3000,
		host: true,
		proxy: {
			'/api': {
				target: 'http://localhost:4400',
				changeOrigin: true,
			},
		},
	},
});
