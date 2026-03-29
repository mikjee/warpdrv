import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { subscribeWithSelector } from 'zustand/middleware';
import type { AppState } from './types';
import { sseConnectionSlice } from './slices/sseConnection';
import { sseHandlersSlice } from './slices/sseHandlers';
import { serversSlice } from './slices/servers';
import { downloadsSlice } from './slices/downloads';
import { devicesSlice } from './slices/devices';
import { proxySlice } from './slices/proxy';

export const useStore = create<AppState>()(
	subscribeWithSelector(
		immer((set, get, initialState) => ({
			...sseConnectionSlice(set, get, initialState),
			...serversSlice(set, get, initialState),
			...downloadsSlice(set, get, initialState),
			...devicesSlice(set, get, initialState),
			...proxySlice(set, get, initialState),
			...sseHandlersSlice(set, get, initialState),
		})),
	),
);
