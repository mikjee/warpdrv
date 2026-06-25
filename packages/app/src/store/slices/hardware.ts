import type { AppState, ImmerSet, ImmerGet } from '../types';
import type { IHardwareInfo } from '@warpcore/shared';
interface HardwareSlice {
	hardware: IHardwareInfo | null;
}
export const hardwareSlice = (
	_setState: ImmerSet<AppState>,
	_getState: ImmerGet<AppState>,
): Partial<AppState> => ({
	hardware: null,
});
