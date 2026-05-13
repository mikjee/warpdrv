import type { TOs, TArch, TBackendKind, IBackendAsset } from '@warpcore/shared';
export type { TOs, TArch, TBackendKind, IBackendAsset };
interface IGithubReleaseAsset {
	name: string;
	size: number;
	browser_download_url: string;
}
interface IGithubRelease {
	tag_name: string;
	assets: IGithubReleaseAsset[];
}
const UPSTREAM_LATEST = 'https://api.github.com/repos/ggml-org/llama.cpp/releases/latest';
const LEMONADE_LATEST = 'https://api.github.com/repos/lemonade-sdk/llamacpp-rocm/releases/latest';
const WHISPER_LATEST = 'https://api.github.com/repos/ggml-org/whisper.cpp/releases/latest';
async function fetchLatest(url: string): Promise<IGithubRelease | null> {
	try {
		const res = await fetch(url, { headers: { 'Accept': 'application/vnd.github+json' } });
		if (!res.ok) return null;
		return await res.json() as IGithubRelease;
	} catch {
		return null;
	}
}
function parseUpstreamAsset(asset: IGithubReleaseAsset, tag: string): IBackendAsset | null {
	const name = asset.name;
	if (!name.startsWith('llama-') || !name.includes('-bin-')) return null;
	if (name.startsWith('cudart-')) return null;
	const buildMatch = name.match(/^llama-(b\d+)-bin-/);
	if (!buildMatch) return null;
	const llamaBuild = buildMatch[1];
	const lower = name.toLowerCase();
	let osName: TOs | null = null;
	if (lower.includes('-win-')) osName = 'win';
	else if (lower.includes('-ubuntu-')) osName = 'linux';
	else if (lower.includes('-macos-')) osName = 'mac';
	if (!osName) return null;
	let arch: TArch = 'x64';
	if (lower.includes('-arm64')) arch = 'arm64';
	let backend: TBackendKind | null = null;
	let backendVersion: string | null = null;
	const cudaMatch = lower.match(/-cuda-([\d.]+)-/);
	const rocmMatch = lower.match(/-rocm-([\d.]+)-/);
	if (cudaMatch) {
		backend = 'cuda';
		backendVersion = cudaMatch[1];
	} else if (rocmMatch) {
		backend = 'rocm';
		backendVersion = rocmMatch[1];
	} else if (lower.includes('-vulkan')) {
		backend = 'vulkan';
	} else if (lower.includes('-hip')) {
		backend = 'hip';
	} else if (lower.includes('-sycl')) {
		return null;
	} else if (lower.includes('-openvino')) {
		return null;
	} else if (osName === 'mac') {
		backend = 'metal';
	} else if (lower.match(/-(avx2|avx512|noavx|cpu)-?/) || lower.endsWith('-x64.zip') || lower.endsWith('-arm64.zip')) {
		backend = 'cpu';
	}
	if (!backend) return null;
	if (backend === 'cpu' && lower.includes('avx512')) return null;
	if (backend === 'cpu' && lower.includes('noavx')) return null;
	const key = `upstream-${osName}-${arch}-${backend}${backendVersion ? '-' + backendVersion : ''}`;
	return {
		key,
		source: 'upstream',
		os: osName,
		arch,
		backend,
		backendVersion,
		gpuArch: null,
		llamaBuild,
		url: asset.browser_download_url,
		size: asset.size,
		filename: name,
	};
}
function parseLemonadeAsset(asset: IGithubReleaseAsset, _tag: string): IBackendAsset | null {
	const name = asset.name;
	const lower = name.toLowerCase();
	if (!lower.includes('rocm')) return null;
	if (!lower.endsWith('.zip') && !lower.endsWith('.tar.gz') && !lower.endsWith('.tgz')) return null;
	let osName: TOs | null = null;
	if (lower.includes('windows') || lower.includes('win')) osName = 'win';
	else if (lower.includes('ubuntu') || lower.includes('linux')) osName = 'linux';
	if (!osName) return null;
	const buildMatch = name.match(/(b\d+)/);
	const llamaBuild = buildMatch ? buildMatch[1] : 'nightly';
	const rocmMatch = lower.match(/rocm[-_]?([\d.]+)/);
	const backendVersion = rocmMatch ? rocmMatch[1] : null;
	const gfxMatch = name.match(/gfx[0-9a-fA-FxX]+/);
	const gpuArch = gfxMatch ? gfxMatch[0].toLowerCase() : null;
	const key = `lemonade-${osName}-x64-rocm${backendVersion ? '-' + backendVersion : ''}${gpuArch ? '-' + gpuArch : ''}`;
	return {
		key,
		source: 'lemonade',
		os: osName,
		arch: 'x64',
		backend: 'rocm',
		backendVersion,
		gpuArch,
		llamaBuild,
		url: asset.browser_download_url,
		size: asset.size,
		filename: name,
	};
}
function dedupeAssets(assets: IBackendAsset[]): IBackendAsset[] {
	const byKey: Record<string, IBackendAsset> = {};
	for (const asset of assets) {
		const dedupeKey = `${asset.os}-${asset.arch}-${asset.backend}-${asset.gpuArch ?? 'any'}`;
		const existing = byKey[dedupeKey];
		if (!existing) {
			byKey[dedupeKey] = asset;
			continue;
		}
		if (asset.backend === 'rocm' && asset.source === 'lemonade' && existing.source !== 'lemonade') {
			byKey[dedupeKey] = asset;
		}
	}
	return Object.values(byKey);
}
export async function fetchLlamaReleases(): Promise<IBackendAsset[]> {
	const [upstream, lemonade] = await Promise.all([
		fetchLatest(UPSTREAM_LATEST),
		fetchLatest(LEMONADE_LATEST),
	]);
	const assets: IBackendAsset[] = [];
	if (upstream) {
		for (const a of upstream.assets) {
			const parsed = parseUpstreamAsset(a, upstream.tag_name);
			if (parsed) assets.push(parsed);
		}
	}
	if (lemonade) {
		for (const a of lemonade.assets) {
			const parsed = parseLemonadeAsset(a, lemonade.tag_name);
			if (parsed) assets.push(parsed);
		}
	}
	return dedupeAssets(assets);
}
export async function fetchLlamaReleasesForOs(targetOs: TOs): Promise<IBackendAsset[]> {
	const all = await fetchLlamaReleases();
	return all.filter(a => a.os === targetOs);
}
function parseWhisperAsset(asset: IGithubReleaseAsset, _tag: string): IBackendAsset | null {
	const name = asset.name;
	if (!name.includes('-bin-')) return null;
	if (name.startsWith('cudart-')) return null;
	const buildMatch = name.match(/^whisper-(v?[\d.]+|b\d+)-bin-/);
	const llamaBuild = buildMatch ? buildMatch[1] : 'latest';
	const lower = name.toLowerCase();
	let osName: TOs | null = null;
	if (lower.includes('-win-')) osName = 'win';
	else if (lower.includes('-ubuntu-') || lower.includes('-linux-')) osName = 'linux';
	else if (lower.includes('-macos-') || lower.includes('-darwin-')) osName = 'mac';
	if (!osName) return null;
	let arch: TArch = 'x64';
	if (lower.includes('-arm64')) arch = 'arm64';
	let backend: TBackendKind | null = null;
	let backendVersion: string | null = null;
	const cudaMatch = lower.match(/-cuda-?([\d.]+)?/);
	if (cudaMatch && cudaMatch[0].includes('cuda')) {
		backend = 'cuda';
		backendVersion = cudaMatch[1] ?? null;
	} else if (lower.includes('-vulkan')) {
		backend = 'vulkan';
	} else if (lower.includes('-hip')) {
		backend = 'hip';
	} else if (lower.includes('-sycl')) {
		return null;
	} else if (lower.includes('-openvino')) {
		return null;
	} else if (lower.includes('-coreml')) {
		backend = 'metal';
	} else if (osName === 'mac') {
		backend = 'metal';
	} else if (lower.match(/-(avx2|avx|noavx|cpu)-?/) || lower.endsWith('-x64.zip') || lower.endsWith('-arm64.zip')) {
		backend = 'cpu';
	}
	if (!backend) return null;
	if (backend === 'cpu' && lower.includes('noavx')) return null;
	const key = `whisper-${osName}-${arch}-${backend}${backendVersion ? '-' + backendVersion : ''}`;
	return {
		key,
		source: 'upstream',
		os: osName,
		arch,
		backend,
		backendVersion,
		gpuArch: null,
		llamaBuild,
		url: asset.browser_download_url,
		size: asset.size,
		filename: name,
	};
}
function dedupeWhisperAssets(assets: IBackendAsset[]): IBackendAsset[] {
	const byKey: Record<string, IBackendAsset> = {};
	for (const asset of assets) {
		const dedupeKey = `${asset.os}-${asset.arch}-${asset.backend}`;
		if (!byKey[dedupeKey]) byKey[dedupeKey] = asset;
	}
	return Object.values(byKey);
}
export async function fetchWhisperReleases(): Promise<IBackendAsset[]> {
	const release = await fetchLatest(WHISPER_LATEST);
	if (!release) return [];
	const assets: IBackendAsset[] = [];
	for (const a of release.assets) {
		const parsed = parseWhisperAsset(a, release.tag_name);
		if (parsed) assets.push(parsed);
	}
	return dedupeWhisperAssets(assets);
}
export async function fetchWhisperReleasesForOs(targetOs: TOs): Promise<IBackendAsset[]> {
	const all = await fetchWhisperReleases();
	return all.filter(a => a.os === targetOs);
}
