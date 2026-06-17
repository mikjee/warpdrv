import React from 'react';
import { Box } from '@chakra-ui/react';
import { useStore } from '@/store';
import { WithErrorBoundary } from '@/components/WithErrorBoundary';
import type { TUISpaceComponentId } from '@/store/slices/uiSpaces';

export const UiSpaceWrapper = ({ componentId, children }: { componentId: TUISpaceComponentId; children?: React.ReactNode }) => {
    const entry = useStore(s => s.uiSpaceComponentsById[componentId]);
    if (!entry) return children;

    const Comp = entry.component;
    return (
        <WithErrorBoundary
            name={entry.label}
            fallback={
                <Box color="red.500" fontSize="xs">
                    {entry.label} — error
                </Box>
            }
        >
            <Comp def={entry} {...(entry.props || {})}>{children}</Comp>
        </WithErrorBoundary>
    );
};
