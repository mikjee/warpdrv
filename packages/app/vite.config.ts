import { defineConfig } from 'vite';
import path from 'path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import react from '@vitejs/plugin-react';
import httpProxy from 'http-proxy-3';

export default defineConfig({
	plugins: [
		{
			name: 'realm-ws-proxy',
			configureServer(server) {
				const target = `ws://localhost:${process.env.CONTROL_API_PORT ?? '4400'}`;
				const proxy = httpProxy.createProxyServer({ target, ws: true });
				proxy.on('error', (err) => {
					console.log('[realm-ws-proxy] error:', err.message);
				});
				proxy.on('open', (proxySocket) => {
					console.log('[realm-ws-proxy] backend socket open');
					proxySocket.on('close', () => console.log('[realm-ws-proxy] backend socket closed'));
				});
				proxy.on('proxyReqWs', (_pr, _req, socket) => {
					socket.on('close', () => console.log('[realm-ws-proxy] client socket closed'));
					socket.on('error', (e) => console.log('[realm-ws-proxy] client socket error:', e.message));
				});
				server.httpServer?.prependListener('upgrade', (req, socket, head) => {
					if (!req.url) return;
					if (req.url.startsWith('/api/realm')) {
						console.log('[realm-ws-proxy] upgrading', req.url);
						socket.setTimeout(0);
						socket.setNoDelay(true);
						socket.setKeepAlive(true, 0);
						proxy.ws(req, socket, head, { target });
					}
				});
			},
		},
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
		{
			name: 'copy-vad-onnx-assets',
			closeBundle() {
				const pairs: [string, string][] = [
					['../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs', 'dist/onnxruntime/ort-wasm-simd-threaded.mjs'],
					['../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm', 'dist/onnxruntime/ort-wasm-simd-threaded.wasm'],
					['../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.mjs', 'dist/onnxruntime/ort-wasm-simd-threaded.jsep.mjs'],
					['../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.wasm', 'dist/onnxruntime/ort-wasm-simd-threaded.jsep.wasm'],
					['../../node_modules/@ricky0123/vad-web/dist/vad.worklet.bundle.min.js', 'dist/vad/vad.worklet.bundle.min.js'],
				]
				for (const [src, dst] of pairs) {
					const srcAbs = path.resolve(__dirname, src)
					const dstAbs = path.resolve(__dirname, dst)
					fs.mkdirSync(path.dirname(dstAbs), { recursive: true })
					fs.copyFileSync(srcAbs, dstAbs)
				}
			}
		}
	],
	define: {
		__CONTROL_API_PORT__: JSON.stringify(process.env.CONTROL_API_PORT ?? '4400'),
	},
	worker: {
		format: 'es',
	},
	build: { sourcemap: true, minify: false },
	resolve: {
		alias: {
			'@': path.resolve(__dirname, './src'),
		},
	},
	server: {
		port: 3000,
		host: true,
		hmr: {
			port: 3001,
		},
		headers: [
			{ name: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
			{ name: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
		],
		proxy: {
			'/api': {
				target: `http://localhost:${process.env.CONTROL_API_PORT ?? '4400'}`,
				changeOrigin: true,
				configure: (proxy) => {
					proxy.on('proxyReqWs', () => {
						console.log('[proxy] /api ws upgrade forwarded');
					});
					proxy.on('proxyReq', (_pr, req) => {
						if ((req.url || '').includes('realm')) console.log('[proxy] /api HTTP got realm:', req.url);
					});
					proxy.on('proxyRes', (res, req, _req) => {
						res.headers['Cache-Control'] = 'no-cache';
						res.headers['Connection'] = 'keep-alive';
					});
				},
			},
		},
	},
});
