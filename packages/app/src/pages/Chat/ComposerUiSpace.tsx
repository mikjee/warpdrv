import React from 'react';
import { Box } from '@chakra-ui/react';
import { useStore } from '@/store';
import { WithErrorBoundary } from '@/components/WithErrorBoundary';

export const ComposerUiSpace = React.memo(() => {
    const components = useStore(s => s.uiSpaceComponents['composer']);

    if (!components || Object.keys(components).length === 0) return null;

    return (
        <Box
            display="flex"
            flexDir="row"
            gap="2"
            overflowX="auto"
            minWidth="0"
        >
                {Object.values(components || {}).map(entry => {
                    const Comp = React.memo(entry.component);
                    return (
                        <Box
                            key={entry.id}
                            display="inline-flex"
                            flexShrink={0}
                            alignItems="center"
                            gap="1.5"
                            px="2"
                            py="1"
                            borderRadius="md"
                            bg="var(--wc-bg-card)"
                            borderWidth="1px"
                            borderColor="var(--wc-border-subtle)"
                        >
                            <WithErrorBoundary
                                name={entry.componentName}
                                fallback={
                                    <Box color="red.500" fontSize="xs">
                                        {entry.componentName} — error
                                    </Box>
                                }
                            >
                                <Comp />
                            </WithErrorBoundary>
                        </Box>
                    );
                })}
        </Box>
    );
});
