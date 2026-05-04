import React, { useState, useRef } from 'react';
import {
	Box, Text, HStack, Flex, Input, Button, Slider, Portal,
} from '@chakra-ui/react';
import { ChevronDown, Check } from 'lucide-react';

// ============================================================
// ToggleChip
// ============================================================
export function ToggleChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
	return (
		<Button
			size="xs" px="3" py="1.5" h="auto" borderRadius="lg" fontSize="12px" fontWeight="500"
			bg={active ? 'var(--w-servers-launch-togglechip-active-bg)' : 'var(--w-servers-launch-togglechip-inactive-bg)'}
			color={active ? 'var(--w-servers-launch-togglechip-active-color)' : 'var(--w-servers-launch-togglechip-inactive-color)'}
			borderWidth="1px"
			borderColor={active ? 'var(--w-servers-launch-togglechip-active-border)' : 'var(--w-servers-launch-togglechip-inactive-border)'}
			_hover={{ bg: active ? 'var(--w-servers-launch-togglechip-active-hover)' : 'var(--w-servers-launch-togglechip-inactive-hover)', color: active ? 'var(--w-servers-launch-togglechip-active-hovercolor)' : 'var(--w-servers-launch-togglechip-inactive-hovercolor)' }}
			onClick={onClick} transition="all 0.15s ease"
		>
			{active && <Check size={12} />}
			{label}
		</Button>
	);
}

// ============================================================
// SelectField
// ============================================================
export function SelectField({ label, value, options, onChange, mono, optionLabels }: {
	label: string; value: string; options: string[]; onChange: (v: string) => void; mono?: boolean; optionLabels?: Record<string, string>;
}) {
	const [open, setOpen] = useState(false);
	const buttonRef = useRef<HTMLButtonElement>(null);
	const displayValue = optionLabels && optionLabels[value] ? optionLabels[value] : value;
	return (
		<Box position="relative" flex="1">
			<Text fontSize="12px" color="var(--w-servers-launch-text-label)" textTransform="uppercase" letterSpacing="0.05em" mb="1.5">{label}</Text>
			<Button ref={buttonRef} w="100%" size="sm" variant="outline" justifyContent="space-between"
				bg="var(--w-servers-launch-input-bg)" borderColor="var(--w-servers-launch-input-border)" color="var(--w-servers-launch-input-color)"
				fontFamily={mono ? '"Geist Mono", monospace' : undefined} fontSize="12px" borderRadius="lg"
				_hover={{ borderColor: 'var(--w-servers-launch-tab-inactive-hover)' }} onClick={() => setOpen(!open)}
			>
				{displayValue}
				<ChevronDown size={14} />
			</Button>
			{open && buttonRef.current && (
				<Portal>
					<Box
						position="fixed"
						top={buttonRef.current.getBoundingClientRect().bottom + 4}
						left={buttonRef.current.getBoundingClientRect().left}
						w={buttonRef.current.getBoundingClientRect().width}
						bg="var(--w-servers-launch-selectfield-dropdown-bg)" borderWidth="1px"
						borderColor="var(--w-servers-launch-selectfield-dropdown-border)" borderRadius="lg" shadow="0 8px 32px rgba(0, 0, 0, 0.5)"
						zIndex={9999} maxH="200px" overflowY="auto" py="1"
					>
						{options.map(opt => {
							const displayLabel = optionLabels && optionLabels[opt] ? optionLabels[opt] : opt;
							return (
								<Box key={opt} px="3" py="1.5" fontSize="12px" fontFamily={mono ? '"Geist Mono", monospace' : undefined}
									color={opt === value ? 'var(--w-servers-launch-selectfield-option-selected)' : 'var(--w-servers-launch-selectfield-option-default)'}
									bg={opt === value ? 'var(--w-servers-launch-selectfield-option-selectedbg)' : 'transparent'}
									cursor="pointer" _hover={{ bg: 'var(--w-servers-launch-selectfield-option-hover)' }}
									onClick={() => { onChange(opt); setOpen(false); }}
								>
									{displayLabel}
								</Box>
							);
						})}
					</Box>
				</Portal>
			)}
		</Box>
	);
}

// ============================================================
// NumberField
// ============================================================
export function NumberField({ label, value, onChange, suffix, min, max, step }: {
	label: string; value: number; onChange: (v: number) => void; suffix?: string; min?: number; max?: number; step?: number;
}) {
	return (
		<Box flex="1">
			<Text fontSize="11px" color="var(--w-servers-launch-text-label)" textTransform="uppercase" letterSpacing="0.05em" mb="1.5">{label}</Text>
			<HStack gap="1.5">
				<Input type="number" value={value} onChange={e => onChange(Number(e.target.value))} size="sm"
					bg="var(--w-servers-launch-input-bg)" borderColor="var(--w-servers-launch-input-border)" color="var(--w-servers-launch-input-color)"
					fontFamily='"Geist Mono", monospace' fontSize="13px" borderRadius="lg"
					_focus={{ borderColor: 'var(--w-servers-launch-input-focus)', outline: 'none' }} min={min} max={max} step={step}
				/>
				{suffix && <Text fontSize="11px" color="var(--w-servers-launch-text-optional)" flexShrink={0}>{suffix}</Text>}
			</HStack>
		</Box>
	);
}

// ============================================================
// SliderNumberField
// ============================================================
function sqrtSliderToValue(position: number, minVal: number, maxVal: number): number {
	if (position <= 0) return minVal;
	if (position >= 100) return maxVal;
	const t = position / 100;
	const value = minVal + t * t * (maxVal - minVal);
	return Math.round(value / 256) * 256;
}

function valueToSqrtSlider(value: number, minVal: number, maxVal: number): number {
	if (value <= minVal) return 0;
	if (value >= maxVal) return 100;
	const t = Math.sqrt((value - minVal) / (maxVal - minVal));
	return t * 100;
}

export function SliderNumberField({ label, value, onChange, min, max, step, suffix, logarithmic }: {
	label: string; value: number; onChange: (v: number) => void;
	min: number; max: number; step?: number; suffix?: string; logarithmic?: boolean;
}) {
	const sliderVal = logarithmic
		? valueToSqrtSlider(value, min, max)
		: ((value - min) / (max - min)) * 100;

	const handleSliderChange = (details: { value: number[] }) => {
		const pos = details.value[0] ?? 0;
		if (logarithmic) {
			onChange(sqrtSliderToValue(pos, min, max));
		} else {
			const val = Math.round(min + (pos / 100) * (max - min));
			onChange(val);
		}
	};

	return (
		<Box>
			<Flex justify="space-between" align="center" mb="1.5">
				<Text fontSize="11px" color="var(--w-servers-launch-text-label)" textTransform="uppercase" letterSpacing="0.05em">{label}</Text>
				{suffix && <Text fontSize="10px" color="var(--w-servers-launch-text-hint)">{suffix}</Text>}
			</Flex>
			<HStack gap="3">
				<Box flex="1">
					<Slider.Root
						min={0} max={100}
						value={[Math.max(0, Math.min(100, sliderVal))]}
						onValueChange={handleSliderChange}
						step={logarithmic ? 0.5 : (step ? (step / (max - min)) * 100 : 1)}
					>
						<Slider.Control>
							<Slider.Track h="6px" borderRadius="full" bg="var(--w-servers-launch-slider-track)">
								<Slider.Range bg="var(--w-servers-launch-slider-range)" borderRadius="full" />
							</Slider.Track>
							<Slider.Thumb
								index={0}
								w="14px" h="14px" borderRadius="full"
								bg="var(--w-servers-launch-slider-thumb)" borderWidth="2px" borderColor="var(--w-servers-launch-slider-thumb-border)"
								shadow="0 2px 8px var(--w-servers-launch-slider-thumb-shadow)"
								_hover={{ transform: 'scale(1.15)' }}
								transition="transform 0.1s ease"
							/>
						</Slider.Control>
					</Slider.Root>
				</Box>
				<Input
					type="number" value={value}
					onChange={e => {
						const v = Number(e.target.value);
						if (!isNaN(v)) onChange(Math.max(min, Math.min(max, v)));
					}}
					size="sm" w="100px"
					bg="var(--w-servers-launch-input-bg)" borderColor="var(--w-servers-launch-input-border)"
					color="var(--w-servers-launch-input-color)" fontFamily='"Geist Mono", monospace'
					fontSize="13px" borderRadius="lg" textAlign="right"
					_focus={{ borderColor: 'var(--w-servers-launch-input-focus)', outline: 'none' }}
					min={min} max={max}
				/>
			</HStack>
		</Box>
	);
}
