import type { AppState, ImmerSet, ImmerGet } from '../types';
import type { TWhisperServerId, IWhisperServer } from '@warpcore/shared';

interface WhisperServersSlice {
	whisperServers: Record<TWhisperServerId, IWhisperServer>;
	whisperServerLogs: Record<TWhisperServerId, string[]>;
}

export const whisperServersSlice = (
	_setState: ImmerSet<AppState>,
	_getState: ImmerGet<AppState>
): Partial<AppState> => ({
	whisperServers: {},
	whisperServerLogs: {},
});
