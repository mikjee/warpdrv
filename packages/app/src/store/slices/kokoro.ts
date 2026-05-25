import type { AppState, ImmerSet, ImmerGet } from '../types';
import type { IKokoroStatus } from '@warpcore/shared';
interface KokoroSlice {
	kokoroStatus: IKokoroStatus | null;
	setKokoroStatus: (status: IKokoroStatus | null) => void;
}
export const kokoroSlice = (
	setState: ImmerSet<AppState>,
	_getState: ImmerGet<AppState>,
): Partial<AppState> => ({
	kokoroStatus: null,
	setKokoroStatus: (status) => {
		setState(draft => {
			draft.kokoroStatus = status;
		});
	},
});
