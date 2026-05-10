import type { AppState, ImmerSet, ImmerGet } from '../types';
import type { TWhisperServerId, IWhisperServer, IWhisperModel } from '@warpcore/shared';

interface WhisperServersSlice {
	whisperServers: Record<TWhisperServerId, IWhisperServer>;
	whisperServerLogs: Record<TWhisperServerId, string[]>;
	whisperModels: Record<string, IWhisperModel>;
}

export const whisperServersSlice = (
	_setState: ImmerSet<AppState>,
	_getState: ImmerGet<AppState>
): Partial<AppState> => ({
	whisperServers: {},
	whisperServerLogs: {},
	whisperModels: {},
});
