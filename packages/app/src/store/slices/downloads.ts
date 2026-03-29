import type { StateCreator } from 'zustand';
import type { TDownloadId, IDownload } from '@warpcore/shared';
import type { AppState } from '../types';

interface DownloadsSlice {
	downloads: Record<TDownloadId, IDownload>;
}

export const downloadsSlice: StateCreator<AppState, [], [], DownloadsSlice> = (_set, _get, _initialState) => ({
	downloads: {},
});
