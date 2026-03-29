import type { StateCreator } from 'zustand';
import type { AppState } from '../types';

interface SSEConnectionSlice {
	sseConnected: boolean;
	testData: any | null;
	setSseConnected: (connected: boolean) => void;
}

export const sseConnectionSlice: StateCreator<AppState, [], [], SSEConnectionSlice> = (set, _get, _initialState) => ({
	sseConnected: false,
	testData: null,
	setSseConnected: (connected) => set({ sseConnected: connected }),
});
