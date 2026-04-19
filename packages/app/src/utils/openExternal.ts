const isTauri = !!(window as any).__TAURI_INTERNALS__;

export function openExternal(url: string): void {
	if (!url || !/^https?:\/\//.test(url)) return;
	if (isTauri) {
		import('@tauri-apps/plugin-shell').then(m => m.open(url));
	} else {
		window.open(url, '_blank', 'noopener,noreferrer');
	}
}
