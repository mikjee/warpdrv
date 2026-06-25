import { nanoid } from 'nanoid';
import type React from 'react';
import type { ImmerSet, ImmerGet } from '../types';
import type { AppState } from '../types';

export type TUISpaceComponentId = string;
export type TUISpaceComponent = any;
export type TAppletName = string;

export interface TUiSpaceComponentDef {
    componentId: TUISpaceComponentId;
    label: string;

    appletName: TAppletName;
    location: EUISpaceLoc;

    component: TUISpaceComponent;
    props?: Record<string, unknown>;
    icon?: React.ComponentType<any>;
}

export enum EUISpaceLoc {
    COMPOSER = "composer",
    RIGHT_PANEL = "right_panel",
    MESSAGE = "message",
};

interface UiSpacesSlice {
    uiSpaceComponentsById: Record<TUISpaceComponentId, TUiSpaceComponentDef>;
    uiSpaceComponentsByLocation: Partial<Record<EUISpaceLoc, Record<TUISpaceComponentId, true>>>;
    uiSpaceComponentsByApplet: Record<TAppletName, Record<TUISpaceComponentId, true>>;

    registerUiSpaceComponent: (def: {
        componentId?: TUISpaceComponentId;
        label?: string;

        appletName: TAppletName;
        location: EUISpaceLoc;

        component: TUISpaceComponent;
        props?: Record<string, unknown>;
        icon?: React.ComponentType<any>;
    }) => TUISpaceComponentId;

    unregisterUiSpaceComponent: (
        appletName: string,
        componentId?: TUISpaceComponentId, // if undefined, deletes all for given space or applet
    ) => void;

    setUiSpaceComponentProps: (
        componentId: TUISpaceComponentId, 
        propsPatch: Record<string, unknown>
    ) => void;
}

export function uiSpacesSlice(set: ImmerSet<AppState>, get: ImmerGet<AppState>): Partial<UiSpacesSlice> {
    return {
        uiSpaceComponentsById: {},
        uiSpaceComponentsByLocation: {},
        uiSpaceComponentsByApplet: {},
        registerUiSpaceComponent: (def) => {
            const id = def.componentId || nanoid();
            set(draft => {
                const entry: TUiSpaceComponentDef = {
                    componentId: id,
                    label: def.label || '',
                    appletName: def.appletName,
                    location: def.location,
                    component: def.component,
                    props: def.props,
                    icon: def.icon,
                };
                draft.uiSpaceComponentsById[id] = entry;
                if (!draft.uiSpaceComponentsByLocation[def.location]) {
                    draft.uiSpaceComponentsByLocation[def.location] = {};
                }
                draft.uiSpaceComponentsByLocation[def.location]![id] = true;
                if (!draft.uiSpaceComponentsByApplet[def.appletName]) {
                    draft.uiSpaceComponentsByApplet[def.appletName] = {};
                }
                draft.uiSpaceComponentsByApplet[def.appletName]![id] = true;
            });
            return id;
        },
        unregisterUiSpaceComponent: (appletName, componentId) => {
            set(draft => {
                if (componentId !== undefined) {
                    const entry = draft.uiSpaceComponentsById[componentId];
                    if (entry) {
                        delete draft.uiSpaceComponentsByLocation[entry.location]?.[componentId];
                        delete draft.uiSpaceComponentsByApplet[entry.appletName]?.[componentId];
                        delete draft.uiSpaceComponentsById[componentId];
                    }
                } else {
                    const tracked = draft.uiSpaceComponentsByApplet[appletName];
                    if (tracked) {
                        for (const id of Object.keys(tracked)) {
                            const entry = draft.uiSpaceComponentsById[id];
                            if (entry) {
                                delete draft.uiSpaceComponentsByLocation[entry.location]?.[id];
                            }
                            delete draft.uiSpaceComponentsById[id];
                        }
                        delete draft.uiSpaceComponentsByApplet[appletName];
                    }
                }
            });
        },
        setUiSpaceComponentProps: (componentId, propsPatch) => {
            set(draft => {
                const entry = draft.uiSpaceComponentsById[componentId];
                if (entry) {
                    entry.props = { ...entry.props, ...propsPatch };
                }
            });
        },
    };
}
