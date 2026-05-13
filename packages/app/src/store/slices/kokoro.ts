import type { AppState, ImmerSet, ImmerGet } from '../types';
import type { IKokoroStatus } from '@warpcore/shared';
interface KokoroSlice {
	kokoroStatus: IKokoroStatus | null;
}
export const kokoroSlice = (
	_setState: ImmerSet<AppState>,
	_getState: ImmerGet<AppState>,
): Partial<AppState> => ({
	kokoroStatus: null,
});
