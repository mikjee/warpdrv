import type { ImmerSet, ImmerGet } from '../types';
import type { AppState } from '../types';

export enum EChatSidebarTab {
    CONFIG = 'config',
    TOOLS = 'tools',
    SEARCH = 'search',
    RIGHT_PANEL = 'right-panel',
    GUARDRAILS_PANEL = 'guardrails_panel',
}

export function chatSidebarSlice(set: ImmerSet<AppState>, get: ImmerGet<AppState>) {
	return {
chatSidebarOpen: false as boolean,
	chatSidebarTab: EChatSidebarTab.CONFIG,
	setChatSidebarOpen: (v: boolean) => set(s => { s.chatSidebarOpen = v; }),
	setChatSidebarTab: (tab: EChatSidebarTab) => set(s => { s.chatSidebarTab = tab; }),
	openChatSidebarTab: (tab: EChatSidebarTab) => set(s => { s.chatSidebarTab = tab; s.chatSidebarOpen = true; }),
	};
}
