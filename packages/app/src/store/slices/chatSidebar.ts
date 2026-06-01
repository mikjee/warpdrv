import type { ImmerSet, ImmerGet } from '../types';
import type { AppState } from '../types';

export type TChatSidebarTab = 'config' | 'tools' | 'search';

export function chatSidebarSlice(set: ImmerSet<AppState>, get: ImmerGet<AppState>) {
	return {
		chatSidebarOpen: false as boolean,
		chatSidebarTab: 'config' as TChatSidebarTab,
		setChatSidebarOpen: (v: boolean) => set(s => { s.chatSidebarOpen = v; }),
		setChatSidebarTab: (tab: TChatSidebarTab) => set(s => { s.chatSidebarTab = tab; }),
		openChatSidebarTab: (tab: TChatSidebarTab) => set(s => { s.chatSidebarTab = tab; s.chatSidebarOpen = true; }),
	};
}
