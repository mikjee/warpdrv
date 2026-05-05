import { Box, Text, VStack, Input, NativeSelect, Switch, HStack } from '@chakra-ui/react';
import { ERecipeInputType, type IRecipeInputDef, type TRecipeInputValues } from '@warpcore/shared';

interface IInputFormGeneratorProps {
	inputs: IRecipeInputDef[];
	values: TRecipeInputValues;
	onChange: (name: string, value: string | number | boolean) => void;
	disabled?: boolean;
}

export function InputFormGenerator({ inputs, values, onChange, disabled = false }: IInputFormGeneratorProps) {
	if (inputs.length === 0) {
		return (
			<Box px="3" py="4" textAlign="center">
				<Text fontSize="12px" color="var(--wc-text-faint)">This recipe has no inputs.</Text>
			</Box>
		);
	}

	return (
		<VStack align="stretch" gap="3">
			{inputs.map((input) => {
				const value = values[input.name] ?? input.defaultValue ?? '';

				return (
					<Box key={input.name}>
						<HStack gap="2" mb="1.5">
							<Text fontSize="12px" fontWeight="600" color="var(--wc-text-secondary)" fontFamily='"Geist Mono", monospace'>{input.name}</Text>
							<Text fontSize="10px" color="var(--wc-text-faint)" textTransform="uppercase" letterSpacing="0.05em">{input.type.toLowerCase()}</Text>
						</HStack>

						{input.description && (
							<Text fontSize="11px" color="var(--wc-text-muted)" mb="1.5">{input.description}</Text>
						)}

						{input.type === ERecipeInputType.STRING && (
							<Input
								size="sm"
								value={String(value)}
								onChange={(e) => onChange(input.name, e.target.value)}
								disabled={disabled}
			bg="var(--wc-bg-interactive)"
				borderColor="var(--wc-border-default)"
				color="var(--wc-text-primary)"
				fontSize="13px"
				fontFamily='"Geist Mono", monospace'
				_hover={{ borderColor: 'var(--wc-border-hover)' }}
				_focus={{ borderColor: 'var(--wc-accent-blue)' }}
			/>
						)}

						{input.type === ERecipeInputType.NUMBER && (
							<Input
								type="number"
								size="sm"
								value={String(value)}
								onChange={(e) => {
									const n = Number(e.target.value);
									if (!Number.isNaN(n)) onChange(input.name, n);
								}}
								disabled={disabled}
								bg="var(--wc-bg-interactive)"
								borderColor="var(--wc-border-default)"
								color="var(--wc-text-primary)"
								fontSize="13px"
								fontFamily='"Geist Mono", monospace'
								_hover={{ borderColor: 'var(--wc-border-hover)' }}
								_focus={{ borderColor: 'var(--wc-accent-blue)' }}
							/>
						)}

						{input.type === ERecipeInputType.BOOL && (
							<HStack gap="2" alignItems="center" opacity={disabled ? 0.5 : 1} pointerEvents={disabled ? 'none' : 'auto'}>
								<Switch.Root
									checked={Boolean(value)}
									onCheckedChange={(d: { checked: boolean }) => onChange(input.name, !!d.checked)}
								>
									<Switch.HiddenInput />
									<Switch.Control css={{ bg: Boolean(value) ? 'var(--wc-accent-blue)' : 'var(--wc-bg-surface)' }}>
										<Switch.Thumb css={{ bg: 'var(--wc-special-switch-thumb)' }} />
									</Switch.Control>
								</Switch.Root>
								<Text fontSize="12px" color="var(--wc-text-secondary)">{Boolean(value) ? 'true' : 'false'}</Text>
							</HStack>
						)}

						{input.type === ERecipeInputType.CHOICE && input.options && (
							<NativeSelect.Root size="sm" opacity={disabled ? 0.5 : 1} pointerEvents={disabled ? 'none' : 'auto'}>
								<NativeSelect.Field
									value={String(value)}
									onChange={(e) => onChange(input.name, e.target.value)}
									bg="var(--wc-bg-interactive)"
									borderColor="var(--wc-border-default)"
									color="var(--wc-text-primary)"
									fontSize="13px"
									fontFamily='"Geist Mono", monospace'
								>
									{input.options.map((opt) => (
										<option key={opt} value={opt} style={{ background: 'var(--wc-bg-dialog)' }}>{opt}</option>
									))}
								</NativeSelect.Field>
								<NativeSelect.Indicator />
							</NativeSelect.Root>
						)}
					</Box>
				);
			})}
		</VStack>
	);
}
