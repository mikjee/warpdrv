import type { TDownloadId, IDownload } from '@warpcore/shared';
import type { AppState, ImmerSet, ImmerGet } from '../types';

interface DownloadsSlice {
	downloads: Record<TDownloadId, IDownload>;
}

export const downloadsSlice = (_setState: ImmerSet<AppState>, _getState: ImmerGet<AppState>): Partial<AppState> => ({
	downloads: {},
});
