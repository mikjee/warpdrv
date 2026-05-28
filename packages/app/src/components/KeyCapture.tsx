import { useState, useEffect } from 'react';
import { Button, Text, HStack } from '@chakra-ui/react';

interface IKeyCaptureProps {
	value: string;
	onChange: (key: string) => void;
	onDisable: () => void;
}

export function KeyCapture({ value, onChange, onDisable }: IKeyCaptureProps) {
	const [capturing, setCapturing] = useState(false);

	useEffect(() => {
		if (!capturing) return;

		const handleKey = (e: KeyboardEvent) => {
			e.preventDefault();
			e.stopPropagation();
			setCapturing(false);
			// Don't capture Escape - use it to cancel
			if (e.key === 'Escape') return;
			onChange(e.key);
		};

		document.addEventListener('keydown', handleKey, true);
		return () => document.removeEventListener('keydown', handleKey, true);
	}, [capturing, onChange]);

	return (
		<HStack gap="3" align="center">
			<Text fontSize="13px" color="var(--wc-text-secondary)">PTT Key</Text>
			{capturing ? (
				<Button
					variant="outline"
					size="sm"
					bg="var(--wc-bg-card)"
					borderColor="var(--wc-accent-blue-focus)"
					color="var(--wc-accent-blue)"
					fontSize="13px"
					borderRadius="lg"
					fontWeight="500"
					minW="140px"
					cursor="default"
				>
					Press any key…
				</Button>
			) : (
				<Button
					variant="outline"
					size="sm"
					bg="var(--wc-bg-card)"
					borderColor="var(--wc-border-default)"
					color="var(--wc-text-primary)"
					fontSize="13px"
					borderRadius="lg"
					fontWeight="500"
					minW="140px"
					onClick={() => setCapturing(true)}
				>
					{value || 'Disabled'}
				</Button>
			)}
			<Button
				variant="outline"
				size="sm"
				bg="var(--wc-bg-card)"
				borderColor="var(--wc-border-default)"
				color="var(--wc-text-muted)"
				fontSize="12px"
				borderRadius="lg"
				onClick={() => { setCapturing(false); onDisable(); }}
			>
				Disable
			</Button>
		</HStack>
	);
}
