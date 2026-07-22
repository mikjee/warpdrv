import type { IChatPreset, IChatPresetCreatePayload } from '@warpcore/shared';
import type { AppState, ImmerSet, ImmerGet } from '../types';
import { createChatPreset, deleteChatPreset } from '@/api/services';

interface ChatPresetsSlice {
	chatPresets: IChatPreset[];
	setChatPresets: (presets: IChatPreset[]) => void;
	addChatPreset: (payload: IChatPresetCreatePayload) => Promise<void>;
	removeChatPreset: (id: string) => Promise<void>;
}

export const chatPresetsSlice = (
	setState: ImmerSet<AppState>,
	_getState: ImmerGet<AppState>,
): Partial<AppState> => ({
	chatPresets: [],
	setChatPresets: (presets: IChatPreset[]) => {
		setState(draft => {
			draft.chatPresets = presets;
		});
	},
	addChatPreset: async (payload: IChatPresetCreatePayload) => {
		await createChatPreset(payload);
	},
	removeChatPreset: async (id: string) => {
		await deleteChatPreset(id);
	},
});
