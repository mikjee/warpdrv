import React, { useMemo } from 'react';
import { useStore } from '@/store';
import { EUISpaceLoc, TUiSpaceComponentDef } from '@/store/slices/uiSpaces';
import { WithErrorBoundary } from '@/components/WithErrorBoundary';

const EMPTY: Array<TUiSpaceComponentDef> = [];

export const MessageUiSpace = React.memo(({ children }: { children: React.ReactNode }) => {
    const componentIds = useStore(s => s.uiSpaceComponentsByLocation[EUISpaceLoc.MESSAGE]);
    const entriesById = useStore(s => s.uiSpaceComponentsById);

    const components = useMemo(() => {
        if (!componentIds || !Object.keys(componentIds).length) return EMPTY;
        return Object
            .keys(componentIds)
            .map(id => entriesById[id])
            .filter(entry => !!entry)
            .map(entry => entry);
    }, [
        componentIds,
        entriesById,
    ]);

    let result = children;
    const fallback = children;

    components.forEach((C) => {
        result = <WithErrorBoundary fallback={fallback}>
            <C.component def={C} {...(C.props || {})}>{result}</C.component>
        </WithErrorBoundary>;
    });
    return result;
});
