import { memo } from 'react';
import { Box, IconButton, HStack } from '@chakra-ui/react';
import { X } from 'lucide-react';
import { useStore } from '@/store';
import type { TUiSpaceComponentDef } from '@/store/slices/uiSpaces';

interface UiSpaceChipProps {
    def: TUiSpaceComponentDef;
    label: string;
    isActive: boolean;
    onClose?: (id: string) => void;
}

export const UiSpaceChip = memo(({ def, label, isActive, onClose }: UiSpaceChipProps) => {
    const setProps = useStore(s => s.setUiSpaceComponentProps);
    const unregister = useStore(s => s.unregisterUiSpaceComponent);

    const handleToggle = () => {
        setProps(def.componentId, { isActive: !isActive });
    };

    const handleClose = (e: React.MouseEvent) => {
        e.stopPropagation();
        onClose?.(def.componentId);
        unregister(def.appletName, def.componentId);
    };

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
            bg={isActive ? 'var(--wc-accent-purple-bg-15, rgba(167,139,250,0.15))' : 'var(--wc-bg-subtle)'}
            borderWidth="1px"
            borderColor={isActive ? 'var(--wc-accent-purple-border, rgba(167,139,250,0.25))' : 'var(--wc-border-subtle)'}
            opacity={isActive ? 1 : 0.6}
            onClick={handleToggle}
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
                    color={isActive ? 'var(--wc-text-muted)' : 'var(--wc-text-faint)'}
                    _hover={{ color: 'var(--wc-accent-red)', bg: 'transparent' }}
                    onClick={handleClose}
                >
                    <X size={12} />
                </IconButton>
            </HStack>
        </Box>
    );
});
