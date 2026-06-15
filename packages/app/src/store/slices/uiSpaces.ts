import { nanoid } from 'nanoid';
import type { ImmerSet, ImmerGet } from '../types';
import type { AppState } from '../types';

export type TUiSpaceId = string;
export type TUiSpaceComponentId = string;
export type TUiSpaceComponent = () => JSX.Element;

export interface TUiSpaceDefinition {
    id: TUiSpaceComponentId;
    spaceId: TUiSpaceId;
    component: TUiSpaceComponent;
    componentName: string;
    appletName: string;
}

interface UiSpacesSlice {
    uiSpaceComponents: Record<TUiSpaceId, Record<TUiSpaceComponentId, TUiSpaceDefinition>>;
    uiSpaceComponentsByApplet: Record<string, Record<TUiSpaceComponentId, true>>;
    registerUiSpaceComponent: (spaceId: TUiSpaceId, component: TUiSpaceComponent, opts: { componentName: string; appletName: string }) => TUiSpaceComponentId;
    unregisterUiSpaceComponent: (id: TUiSpaceComponentId, appletName: string) => void;
}

export function uiSpacesSlice(set: ImmerSet<AppState>, get: ImmerGet<AppState>): Partial<UiSpacesSlice> {
    return {
        uiSpaceComponents: {},
        uiSpaceComponentsByApplet: {},
        registerUiSpaceComponent: (spaceId, component, opts) => {
            const id = nanoid();
            set(draft => {
                if (!draft.uiSpaceComponents[spaceId]) {
                    draft.uiSpaceComponents[spaceId] = {};
                }
                draft.uiSpaceComponents[spaceId][id] = { id, spaceId, component, componentName: opts.componentName, appletName: opts.appletName };
                if (!draft.uiSpaceComponentsByApplet[opts.appletName]) {
                    draft.uiSpaceComponentsByApplet[opts.appletName] = {};
                }
                draft.uiSpaceComponentsByApplet[opts.appletName][id] = true;
            });
            return id;
        },
        unregisterUiSpaceComponent: (id, appletName) => {
            set(draft => {
                for (const spaceId of Object.keys(draft.uiSpaceComponents)) {
                    delete draft.uiSpaceComponents[spaceId][id];
                }
                if (draft.uiSpaceComponentsByApplet[appletName]) {
                    delete draft.uiSpaceComponentsByApplet[appletName][id];
                }
            });
        },
    };
}
