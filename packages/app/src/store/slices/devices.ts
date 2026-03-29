import type { StateCreator } from 'zustand';
import type { IDevice } from '@warpcore/shared';
import type { AppState } from '../types';

interface DevicesSlice {
	devices: IDevice[];
}

export const devicesSlice: StateCreator<AppState, [], [], DevicesSlice> = (_set, _get, _initialState) => ({
	devices: [],
});
