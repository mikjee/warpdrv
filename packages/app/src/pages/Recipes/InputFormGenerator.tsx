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
				<Text fontSize="12px" color="rgba(255, 255, 255, 0.3)">This recipe has no inputs.</Text>
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
							<Text fontSize="12px" fontWeight="600" color="rgba(255, 255, 255, 0.8)" fontFamily='"Geist Mono", monospace'>{input.name}</Text>
							<Text fontSize="10px" color="rgba(255, 255, 255, 0.35)" textTransform="uppercase" letterSpacing="0.05em">{input.type.toLowerCase()}</Text>
						</HStack>

						{input.description && (
							<Text fontSize="11px" color="rgba(255, 255, 255, 0.4)" mb="1.5">{input.description}</Text>
						)}

						{input.type === ERecipeInputType.STRING && (
							<Input
								size="sm"
								value={String(value)}
								onChange={(e) => onChange(input.name, e.target.value)}
								disabled={disabled}
								bg="rgba(255, 255, 255, 0.02)"
								borderColor="rgba(255, 255, 255, 0.08)"
								color="#e4e4e7"
								fontSize="13px"
								fontFamily='"Geist Mono", monospace'
								_hover={{ borderColor: 'rgba(255, 255, 255, 0.15)' }}
								_focus={{ borderColor: '#3381ff' }}
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
								bg="rgba(255, 255, 255, 0.02)"
								borderColor="rgba(255, 255, 255, 0.08)"
								color="#e4e4e7"
								fontSize="13px"
								fontFamily='"Geist Mono", monospace'
								_hover={{ borderColor: 'rgba(255, 255, 255, 0.15)' }}
								_focus={{ borderColor: '#3381ff' }}
							/>
						)}

						{input.type === ERecipeInputType.BOOL && (
							<HStack gap="2" alignItems="center" opacity={disabled ? 0.5 : 1} pointerEvents={disabled ? 'none' : 'auto'}>
								<Switch.Root
									checked={Boolean(value)}
									onCheckedChange={(d: { checked: boolean }) => onChange(input.name, !!d.checked)}
								>
									<Switch.HiddenInput />
									<Switch.Control css={{ bg: Boolean(value) ? '#3b86d6' : 'surface.4' }}>
										<Switch.Thumb css={{ bg: 'rgba(25, 25, 25)' }} />
									</Switch.Control>
								</Switch.Root>
								<Text fontSize="12px" color="rgba(255, 255, 255, 0.6)">{Boolean(value) ? 'true' : 'false'}</Text>
							</HStack>
						)}

						{input.type === ERecipeInputType.CHOICE && input.options && (
							<NativeSelect.Root size="sm" opacity={disabled ? 0.5 : 1} pointerEvents={disabled ? 'none' : 'auto'}>
								<NativeSelect.Field
									value={String(value)}
									onChange={(e) => onChange(input.name, e.target.value)}
									bg="rgba(255, 255, 255, 0.02)"
									borderColor="rgba(255, 255, 255, 0.08)"
									color="#e4e4e7"
									fontSize="13px"
									fontFamily='"Geist Mono", monospace'
								>
									{input.options.map((opt) => (
										<option key={opt} value={opt} style={{ background: '#0e0e0e' }}>{opt}</option>
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
