import { defineConfig } from 'vite';
import path from 'path';
import react from '@vitejs/plugin-react';

export default defineConfig({
	plugins: [react()],
	define: {
		__CONTROL_API_PORT__: JSON.stringify(process.env.CONTROL_API_PORT ?? '4400'),
	},
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
				target: `http://localhost:${process.env.CONTROL_API_PORT ?? '4400'}`,
				changeOrigin: true,
				ws: true,
				configure: (proxy) => {
					proxy.on('proxyRes', (res, req, _req) => {
						res.headers['Cache-Control'] = 'no-cache';
						res.headers['Connection'] = 'keep-alive';
					});
				},
			},
		},
	},
});
