import { defineConfig } from 'vite';
import path from 'path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
	plugins: [
		react(),
		{
			name: 'serve-onnx-runtime',
			configureServer(server) {
				server.middlewares.use('/onnxruntime', (req, res, next) => {
					const cleanUrl = (req.url || '').split('?')[0];
					const filePath = path.join(
						__dirname,
						'../../node_modules/onnxruntime-web/dist',
						cleanUrl
					);
					if (!fs.existsSync(filePath)) return next();
					const ext = path.extname(filePath);
					res.setHeader('Content-Type',
						ext === '.mjs' ? 'text/javascript' : 'application/wasm'
					);
					fs.createReadStream(filePath).pipe(res);
				});
				server.middlewares.use('/vad', (req, res, next) => {
					const cleanUrl = (req.url || '').split('?')[0];
					// Check node_modules first (worklet bundle), fall back to public/vad (model file)
					const candidates = [
						path.join(__dirname, '../../node_modules/@ricky0123/vad-web/dist', cleanUrl),
						path.join(__dirname, 'public/vad', cleanUrl),
					];
					const filePath = candidates.find(p => fs.existsSync(p));
					if (!filePath) return next();
					const ext = path.extname(filePath);
					const contentType =
						ext === '.js' ? 'text/javascript' :
						ext === '.onnx' ? 'application/octet-stream' :
						'application/octet-stream';
					res.setHeader('Content-Type', contentType);
					fs.createReadStream(filePath).pipe(res);
				});
			}
},
		viteStaticCopy({
			targets: [
				{ src: '../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs', dest: 'onnxruntime' },
				{ src: '../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm', dest: 'onnxruntime' },
				{ src: 'public/vad/silero_vad_v5.onnx', dest: 'vad' },
				{ src: '../../node_modules/@ricky0123/vad-web/dist/vad.worklet.bundle.min.js', dest: 'vad' }
			]
		})
	],
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
