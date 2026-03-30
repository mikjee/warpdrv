import type { AppState, ImmerSet, ImmerGet } from '../types';

interface SSEConnectionSlice {
	sseConnected: boolean;
	testData: any | null;
	setSseConnected: (connected: boolean) => void;
}

export const sseConnectionSlice = (setState: ImmerSet<AppState>, _getState: ImmerGet<AppState>): Partial<AppState> => ({
	sseConnected: false,
	testData: null,
	setSseConnected: (connected) => setState((state) => { state.sseConnected = connected; }),
});
