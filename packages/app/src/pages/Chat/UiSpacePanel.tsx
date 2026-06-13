import React from 'react';
import { Box } from '@chakra-ui/react';
import { useStore } from '@/store';
import type { TUiSpaceId } from '@/store/slices/uiSpaces';

const EMPTY: Record<string, unknown> = {};

export const UiSpacePanel = React.memo(({ spaceId }: { spaceId: TUiSpaceId }) => {
    const components = useStore(s => s.uiSpaceComponents[spaceId] || EMPTY);
    return (
        <Box overflowY="auto" css={{
            '&::-webkit-scrollbar': { width: '4px' },
            '&::-webkit-scrollbar-thumb': { background: 'var(--wc-text-disabled)', borderRadius: '2px' },
        }}>
            {Object.values(components).map(entry => {
                const Comp = entry.component;
                return <Comp key={entry.id} />;
            })}
        </Box>
    );
});
