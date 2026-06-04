import { useState, useEffect, useMemo } from 'react';
import { Button, Text, HStack } from '@chakra-ui/react';

interface IKeyCaptureProps {
	value: string;
	onChange: (key: string) => void;
	onDisable: () => void;
	label?: string;
}

const MODIFIER_MAP: Record<string, string> = {
	ControlLeft: 'Ctrl',
	ControlRight: 'Ctrl',
	ShiftLeft: 'Shift',
	ShiftRight: 'Shift',
	AltLeft: 'Alt',
	AltRight: 'Alt',
	MetaLeft: 'Meta',
	MetaRight: 'Meta',
};

function formatCombo(combo: string): string {
	if (!combo) return 'Disabled';
	return combo
		.split('|')
		.map((code) => MODIFIER_MAP[code] ?? code)
		.join(' + ');
}

export function KeyCapture({ value, onChange, onDisable, label = 'PTT Key' }: IKeyCaptureProps) {
	const [capturing, setCapturing] = useState(false);

	const display = useMemo(() => formatCombo(value), [value]);

	useEffect(() => {
		if (!capturing) return;
		const localKeys: Record<string, true> = {};

		const onDown = (e: KeyboardEvent) => {
			localKeys[e.code] = true;
		};
		const onUp = (e: KeyboardEvent) => {
			e.preventDefault();
			e.stopPropagation();
			setCapturing(false);
			if (e.code === 'Escape') return;
			const snapshot = Object.keys(localKeys);
			if (snapshot.length > 0) {
				onChange(snapshot.join('|'));
			}
		};

		document.addEventListener('keydown', onDown, true);
		document.addEventListener('keyup', onUp, true);
		return () => {
			document.removeEventListener('keydown', onDown, true);
			document.removeEventListener('keyup', onUp, true);
		};
	}, [capturing, onChange]);

	return (
		<HStack gap="3" align="center">
			<Text fontSize="13px" color="var(--wc-text-secondary)">{label}</Text>
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
					Press keys…
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
					{display}
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
