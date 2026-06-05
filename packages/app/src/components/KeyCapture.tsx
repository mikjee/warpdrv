import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
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
	const localKeysRef = useRef<Record<string, true>>({});
	const onChangeRef = useRef(onChange);
	onChangeRef.current = onChange;

	const display = useMemo(() => formatCombo(value), [value]);

	const onDown = useCallback((e: KeyboardEvent) => {
		localKeysRef.current[e.code] = true;
	}, []);

	const onUp = useCallback((e: KeyboardEvent) => {
		e.preventDefault();
		e.stopPropagation();
		setCapturing(false);
		if (e.code === 'Escape') return;
		const snapshot = Object.keys(localKeysRef.current);
		if (snapshot.length > 0) {
			onChangeRef.current(snapshot.join('|'));
		}
	}, []);

	useEffect(() => {
		if (capturing) {
			localKeysRef.current = {};
			document.addEventListener('keydown', onDown, true);
			document.addEventListener('keyup', onUp, true);
			return () => {
				document.removeEventListener('keydown', onDown, true);
				document.removeEventListener('keyup', onUp, true);
			};
		}
	}, [capturing, onDown, onUp]);

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
