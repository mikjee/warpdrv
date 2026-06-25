import type { AppState, ImmerSet, ImmerGet } from '../types';
import type { IBackendAsset } from '@warpcore/shared';
interface ReleasesSlice {
	llamaReleases: Record<string, IBackendAsset>;
	whisperReleases: Record<string, IBackendAsset>;
}
export const releasesSlice = (
	_setState: ImmerSet<AppState>,
	_getState: ImmerGet<AppState>,
): Partial<AppState> => ({
	llamaReleases: {},
	whisperReleases: {},
});
