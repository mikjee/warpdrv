import React from 'react';
import { useStore } from '@/store';
import { EUISpaceLoc } from '@/store/slices/uiSpaces';

export const MessageUiSpace = React.memo(({ children }: { children: React.ReactNode }) => {
    const componentIds = useStore(s => s.uiSpaceComponentsByLocation[EUISpaceLoc.MESSAGE]);
    const entriesById = useStore(s => s.uiSpaceComponentsById);

    if (!componentIds || !Object.keys(componentIds).length) return children;

    let result = children;
    for (const id of Object.keys(componentIds)) {
        const entry = entriesById[id];
        if (!entry) continue;
        const Comp = entry.component;
        result = <Comp def={entry} {...(entry.props || {})}>{result}</Comp>;
    }
    return result;
});
