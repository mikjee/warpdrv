import type { AppState, ImmerSet, ImmerGet } from '../types';
import type { TWhisperBackendId, IWhisperBackend } from '@warpcore/shared';

interface WhisperBackendsSlice {
	whisperBackends: Record<TWhisperBackendId, IWhisperBackend>;
}

export const whisperBackendsSlice = (
	_setState: ImmerSet<AppState>,
	_getState: ImmerGet<AppState>
): Partial<AppState> => ({
	whisperBackends: {},
});
