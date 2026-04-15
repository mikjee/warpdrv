import type { AppState, ImmerSet, ImmerGet } from '../types';
import type { ICheckpoint, TCheckpointId } from '@warpcore/shared';

interface CheckpointsSlice {
	checkpoints: Record<TCheckpointId, ICheckpoint>;
}

export const checkpointsSlice = (
	_setState: ImmerSet<AppState>,
	_getState: ImmerGet<AppState>,
): Partial<AppState> => ({
	checkpoints: {},
});
