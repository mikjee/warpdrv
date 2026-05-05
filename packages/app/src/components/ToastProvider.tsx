import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { Box, Text, HStack, Flex } from '@chakra-ui/react';
import { CheckCircle, AlertCircle, X, Info } from 'lucide-react';

type TToastType = 'success' | 'error' | 'info';

interface IToast {
	id: number;
	type: TToastType;
	message: string;
}

interface IToastContext {
	toast: (type: TToastType, message: string) => void;
}

const ToastContext = createContext<IToastContext>({ toast: () => {} });

export function useToast() {
	return useContext(ToastContext);
}

let nextId = 0;

const TOAST_COLORS: Record<TToastType, { bg: string; border: string; icon: string }> = {
	success: { bg: 'var(--wc-accent-green-bg-8)', border: 'var(--wc-accent-green-border)', icon: 'var(--wc-accent-green)' },
	error: { bg: 'var(--wc-accent-red-bg-8)', border: 'var(--wc-accent-red-border)', icon: 'var(--wc-accent-red)' },
	info: { bg: 'var(--wc-accent-blue-bg-8)', border: 'var(--wc-accent-blue-border)', icon: 'var(--wc-accent-blue)' },
};

const TOAST_ICONS: Record<TToastType, ReactNode> = {
	success: <CheckCircle size={14} />,
	error: <AlertCircle size={14} />,
	info: <Info size={14} />,
};

export function ToastProvider({ children }: { children: ReactNode }) {
	const [toasts, setToasts] = useState<IToast[]>([]);

	const toast = useCallback((type: TToastType, message: string) => {
		const id = ++nextId;
		setToasts(prev => [...prev, { id, type, message }]);
		const duration = type === 'error' ? 30000 : 4000;
		setTimeout(() => {
			setToasts(prev => prev.filter(t => t.id !== id));
		}, duration);
	}, []);

	const dismiss = useCallback((id: number) => {
		setToasts(prev => prev.filter(t => t.id !== id));
	}, []);

	return (
		<ToastContext.Provider value={{ toast }}>
			{children}
			{/* Toast container */}
			<Flex
				position="fixed"
				bottom="21px"
				right="21px"
				direction="column"
				gap="2"
				zIndex="toast"
				maxW="400px"
			>
				{toasts.map(t => {
					const colors = TOAST_COLORS[t.type];
					return (
						<HStack
							key={t.id}
							px="4"
							py="3"
							borderRadius="xl"
							bg={colors.bg}
							borderWidth="1px"
							borderColor={colors.border}
							backdropFilter="blur(12px)"
							shadow="0 8px 32px rgba(0, 0, 0, 0.4)"
							gap="2.5"
							animation="slideUp 0.2s ease"
						>
							<Box color={colors.icon} flexShrink={0}>{TOAST_ICONS[t.type]}</Box>
							<Text fontSize="12px" color="var(--wc-text-primary)" flex="1">{t.message}</Text>
							<Box
								as="button"
								color="var(--wc-text-muted)"
								_hover={{ color: 'var(--wc-text-heading)' }}
								onClick={() => dismiss(t.id)}
								cursor="pointer"
								flexShrink={0}
							>
								<X size={12} />
							</Box>
						</HStack>
					);
				})}
			</Flex>
		</ToastContext.Provider>
	);
}
