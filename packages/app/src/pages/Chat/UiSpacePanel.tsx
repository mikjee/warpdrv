import React from 'react';
import { Box, AccordionRoot, AccordionItem as AccordionItemComp, AccordionItemTrigger, AccordionItemContent, HStack } from '@chakra-ui/react';
import { ChevronDown } from 'lucide-react';
import { useStore } from '@/store';
import type { TUiSpaceId } from '@/store/slices/uiSpaces';
import { WithErrorBoundary } from '@/components/WithErrorBoundary';

const EMPTY: Record<string, unknown> = {};

export const UiSpacePanel = React.memo(({ spaceId }: { spaceId: TUiSpaceId }) => {
    const components = useStore(s => s.uiSpaceComponents[spaceId]);
    return (
        <Box overflowY="auto" css={{
            '&::-webkit-scrollbar': { width: '4px' },
            '&::-webkit-scrollbar-thumb': { background: 'var(--wc-text-disabled)', borderRadius: '2px' },
        }}
            p="2.5"
        >
            <AccordionRoot collapsible defaultValue={[]}>
                {Object.values(components || {}).map(entry => {
                    const Comp = React.memo(entry.component);
                    return (
                        <AccordionItemComp key={entry.id} value={entry.id} mb="2" borderRadius="6px" borderWidth="1px" borderColor="var(--wc-border-subtle)">
                            <AccordionItemTrigger
                                style={{
                                    borderRadius: '6px 6px 0 0',
                                    background: 'var(--wc-bg-card)',
                                    border: 'none',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    width: '100%',
                                }}
                                p="2.5"
                                _hover={{ bg: 'var(--wc-bg-subtle)' }}
                                css={{ '&[data-state=open] .chevron': { transform: 'rotate(180deg)' } }}
                            >
                                <Box fontSize="12px" fontWeight="500" color="var(--wc-text-primary)">
                                    {entry.componentName}
                                </Box>
                                <HStack gap="2" align="center">
                                    <Box fontSize="11px" color="var(--wc-text-muted)">
                                        {entry.appletName}
                                    </Box>
                                    <ChevronDown size={14} color="var(--wc-text-muted)" className="chevron" css={{ transition: 'transform 0.15s ease' }} />
                                </HStack>
                            </AccordionItemTrigger>
                            <AccordionItemContent>
                                <WithErrorBoundary
                                    name={entry.componentName}
                                    fallback={
                                        <Box color="red.500" p={2} fontSize="sm">
                                            {entry.componentName} — error
                                        </Box>
                                    }
                                >
                                    <Comp />
                                </WithErrorBoundary>
                            </AccordionItemContent>
                        </AccordionItemComp>
                    );
                })}
            </AccordionRoot>
        </Box>
    );
});
