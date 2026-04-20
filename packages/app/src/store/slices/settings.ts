import { DEFAULT_SETTINGS, type ISettings } from '@warpcore/shared';
import type { AppState, ImmerSet, ImmerGet } from '../types';

interface SettingsSlice {
	settings: ISettings;
}

export const settingsSlice = (_setState: ImmerSet<AppState>, _getState: ImmerGet<AppState>): Partial<AppState> => ({
	settings: DEFAULT_SETTINGS as ISettings,
});
