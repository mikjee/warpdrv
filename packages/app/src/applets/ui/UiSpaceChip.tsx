import { memo, useCallback } from 'react';
import { Box, IconButton, HStack } from '@chakra-ui/react';
import { X } from 'lucide-react';
import { useStore } from '@/store';
import type { TUiSpaceComponentDef } from '@/store/slices/uiSpaces';
import type { AppState } from '@/store/types';

interface UiSpaceChipProps {
    def: TUiSpaceComponentDef;
    selectLabel: (state: AppState) => string;
    selectIsActive: (state: AppState) => boolean;
    onSetIsActive: (active: boolean) => void;
    onClose?: (id: string) => void;
}

export const UiSpaceChip = memo(({ def, selectLabel, selectIsActive, onSetIsActive, onClose }: UiSpaceChipProps) => {
    const label = useStore(selectLabel);
    const active = useStore(selectIsActive);
    const unregister = useStore(s => s.unregisterUiSpaceComponent);

    const handleClose = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        onClose?.(def.componentId);
        unregister(def.appletName, def.componentId);
    }, [def.componentId, def.appletName, onClose, unregister]);

    return (
        <Box
            display="inline-flex"
            alignItems="center"
            gap="1.5"
            px="2"
            py="1"
            borderRadius="md"
            cursor="pointer"
            userSelect="none"
            transition="all 0.15s ease"
            bg={active ? 'var(--wc-accent-purple-bg-15, rgba(167,139,250,0.15))' : 'var(--wc-bg-subtle)'}
            borderWidth="1px"
            borderColor={active ? 'var(--wc-accent-purple-border, rgba(167,139,250,0.25))' : 'var(--wc-border-subtle)'}
            opacity={active ? 1 : 0.6}
            onClick={() => onSetIsActive(!active)}
        >
            <Box fontSize="xs" fontWeight="500" color="var(--wc-text-primary)">
                {label}
            </Box>
            <HStack gap="0.5">
                <IconButton
                    size="xs"
                    variant="ghost"
                    p="0"
                    minW="16px"
                    h="16px"
                    color={active ? 'var(--wc-text-muted)' : 'var(--wc-text-faint)'}
                    _hover={{ color: 'var(--wc-accent-red)', bg: 'transparent' }}
                    onClick={handleClose}
                >
                    <X size={12} />
                </IconButton>
            </HStack>
        </Box>
    );
});
