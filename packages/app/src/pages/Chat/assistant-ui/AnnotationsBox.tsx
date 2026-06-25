import React from 'react';
import { Box, Text, VStack, HStack } from '@chakra-ui/react';
import { X } from 'lucide-react';
import { useStore } from '@/store';

export const AnnotationsBox = React.memo(() => {
	const annotations = useStore(s => s.annotations);
	const removeAnnotation = useStore(s => s.removeAnnotation);
	const clearAnnotations = useStore(s => s.clearAnnotations);

	if (!annotations.length) return null;

	return (
		<Box borderWidth="1px" borderColor="var(--wc-border-default)" borderRadius="lg" bg="var(--wc-bg-elevated)" p="3" maxH="320px" overflow="auto">
			<HStack justify="space-between" align="center" mb="2">
				<Text fontSize="11px" fontWeight="600" color="var(--wc-text-primary)">Annotations ({annotations.length})</Text>
				<Box
					as="button"
					display="flex"
					alignItems="center"
					gap="1"
					px="2"
					py="0.5"
					fontSize="11px"
					borderRadius="sm"
					color="var(--wc-text-muted)"
					_hover={{ bg: 'var(--wc-bg-hover)', color: 'var(--wc-accent-red)' }}
					onClick={clearAnnotations}
				>
					<X size={12} />
					Clear all
				</Box>
			</HStack>
			<VStack gap="2" align="stretch">
				{annotations.map((annotation, index) => (
					<Box key={annotation.id} borderWidth="1px" borderColor="var(--wc-border-subtle)" borderRadius="md" p="2" bg="var(--wc-bg-subtle)">
						<HStack justify="space-between" align="center" gap="2">
							<HStack flex="1" overflow="hidden" gap="1">
								<Box as="span" fontSize="10px" fontWeight="600" color="var(--wc-accent-blue)" userSelect="none" flexShrink={0}>{index + 1}.</Box>
								<Text fontSize="12px" color="var(--wc-text-muted)" fontFamily="mono" fontStyle="italic" overflow="hidden" textOverflow="ellipsis" flex="1" flexShrink={1}>"{annotation.selectedText}"</Text>
							</HStack>
							<Box
								as="button"
								display="flex"
								alignItems="center"
								justifyContent="center"
								width="20px"
								height="20px"
								borderRadius="sm"
								color="var(--wc-text-muted)"
								flexShrink={0}
								_hover={{ bg: 'var(--wc-bg-hover)', color: 'var(--wc-accent-red)' }}
								onClick={() => removeAnnotation(annotation.id)}
							>
								<X size={12} />
							</Box>
						</HStack>
						{annotation.comment && (
							<Text fontSize="13px" color="var(--wc-text-primary)" mt="1" lineHeight="1.4">{annotation.comment}</Text>
						)}
					</Box>
				))}
			</VStack>
		</Box>
	);
});
