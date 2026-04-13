import type { AppState, ImmerSet, ImmerGet } from '../types';
import type { TBackendId, IBackend, TBackendGroupId, IBackendGroup } from '@warpcore/shared';

interface BackendsSlice {
	backends: Record<TBackendId, IBackend>;
	backendGroups: Record<TBackendGroupId, IBackendGroup>;
}

export const backendsSlice = (
	_setState: ImmerSet<AppState>,
	_getState: ImmerGet<AppState>
): Partial<AppState> => ({
	backends: {},
	backendGroups: {},
});
