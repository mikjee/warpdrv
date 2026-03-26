import { useState, useRef } from 'react';
import {
	Box, Text, HStack, VStack, Flex, Input, Button, Slider, Portal,
} from '@chakra-ui/react';
import { ChevronDown, ChevronRight, Check } from 'lucide-react';
import { EKvQuantType } from '@warpcore/shared';
import { Card } from './Card';

// ============================================================
// Mode
// ============================================================
export enum EParamsMode {
	TARGET = 'TARGET',
	DRAFT = 'DRAFT',
}

// ============================================================
// Shared sub-components
// ============================================================
export function ToggleChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
	return (
		<Button
			size="xs" px="3" py="1.5" h="auto" borderRadius="lg" fontSize="12px" fontWeight="500"
			bg={active ? 'rgba(51, 129, 255, 0.12)' : 'rgba(255, 255, 255, 0.03)'}
			color={active ? '#3381ff' : 'rgba(255, 255, 255, 0.4)'}
			borderWidth="1px"
			borderColor={active ? 'rgba(51, 129, 255, 0.3)' : 'rgba(255, 255, 255, 0.06)'}
			_hover={{ bg: active ? 'rgba(51, 129, 255, 0.18)' : 'rgba(255, 255, 255, 0.06)', color: active ? '#3381ff' : 'rgba(255, 255, 255, 0.6)' }}
			onClick={onClick} transition="all 0.15s ease"
		>
			{active && <Check size={12} />}
			{label}
		</Button>
	);
}

export function SelectField({ label, value, options, onChange, mono, optionLabels }: {
	label: string; value: string; options: string[]; onChange: (v: string) => void; mono?: boolean; optionLabels?: Record<string, string>;
}) {
	const [open, setOpen] = useState(false);
	const buttonRef = useRef<HTMLButtonElement>(null);
	const displayValue = optionLabels && optionLabels[value] ? optionLabels[value] : value;
	return (
		<Box position="relative" flex="1">
			<Text fontSize="11px" color="rgba(255, 255, 255, 0.35)" textTransform="uppercase" letterSpacing="0.05em" mb="1.5">{label}</Text>
			<Button ref={buttonRef} w="100%" size="sm" variant="outline" justifyContent="space-between"
				bg="rgba(255, 255, 255, 0.03)" borderColor="rgba(255, 255, 255, 0.08)" color="rgba(255, 255, 255, 0.7)"
				fontFamily={mono ? '"Geist Mono", monospace' : undefined} fontSize="12px" borderRadius="lg"
				_hover={{ borderColor: 'rgba(255, 255, 255, 0.15)' }} onClick={() => setOpen(!open)}
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
						bg="#18181b" borderWidth="1px"
						borderColor="rgba(255, 255, 255, 0.1)" borderRadius="lg" shadow="0 8px 32px rgba(0, 0, 0, 0.5)"
						zIndex={9999} maxH="200px" overflowY="auto" py="1"
					>
						{options.map(opt => {
							const displayLabel = optionLabels && optionLabels[opt] ? optionLabels[opt] : opt;
							return (
								<Box key={opt} px="3" py="1.5" fontSize="12px" fontFamily={mono ? '"Geist Mono", monospace' : undefined}
									color={opt === value ? '#3381ff' : 'rgba(255, 255, 255, 0.6)'}
									bg={opt === value ? 'rgba(51, 129, 255, 0.08)' : 'transparent'}
									cursor="pointer" _hover={{ bg: 'rgba(255, 255, 255, 0.06)' }}
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

export function NumberField({ label, value, onChange, suffix, min, max, step }: {
	label: string; value: number; onChange: (v: number) => void; suffix?: string; min?: number; max?: number; step?: number;
}) {
	return (
		<Box flex="1">
			<Text fontSize="11px" color="rgba(255, 255, 255, 0.35)" textTransform="uppercase" letterSpacing="0.05em" mb="1.5">{label}</Text>
			<HStack gap="1.5">
				<Input type="number" value={value} onChange={e => onChange(Number(e.target.value))} size="sm"
					bg="rgba(255, 255, 255, 0.03)" borderColor="rgba(255, 255, 255, 0.08)" color="rgba(255, 255, 255, 0.7)"
					fontFamily='"Geist Mono", monospace' fontSize="13px" borderRadius="lg"
					_focus={{ borderColor: 'rgba(51, 129, 255, 0.4)', outline: 'none' }} min={min} max={max} step={step}
				/>
				{suffix && <Text fontSize="11px" color="rgba(255, 255, 255, 0.25)" flexShrink={0}>{suffix}</Text>}
			</HStack>
		</Box>
	);
}

// ============================================================
// Logarithmic slider for context size
// ============================================================
// Maps a 0-100 slider position to a log-scale value between min and max
function logSliderToValue(position: number, minVal: number, maxVal: number): number {
	if (position <= 0) return minVal;
	if (position >= 100) return maxVal;
	const minLog = Math.log(Math.max(minVal, 1));
	const maxLog = Math.log(Math.max(maxVal, 1));
	const value = Math.exp(minLog + (position / 100) * (maxLog - minLog));
	// Round to nearest 256 for context size
	return Math.round(value / 256) * 256;
}

function valueToLogSlider(value: number, minVal: number, maxVal: number): number {
	if (value <= minVal) return 0;
	if (value >= maxVal) return 100;
	const minLog = Math.log(Math.max(minVal, 1));
	const maxLog = Math.log(Math.max(maxVal, 1));
	const valueLog = Math.log(Math.max(value, 1));
	return ((valueLog - minLog) / (maxLog - minLog)) * 100;
}

// ============================================================
// Slider + Input row component
// ============================================================
function SliderNumberField({ label, value, onChange, min, max, step, suffix, logarithmic }: {
	label: string; value: number; onChange: (v: number) => void;
	min: number; max: number; step?: number; suffix?: string; logarithmic?: boolean;
}) {
	const sliderVal = logarithmic
		? valueToLogSlider(value, min, max)
		: ((value - min) / (max - min)) * 100;

	const handleSliderChange = (details: { value: number[] }) => {
		const pos = details.value[0] ?? 0;
		if (logarithmic) {
			onChange(logSliderToValue(pos, min, max));
		} else {
			const val = Math.round(min + (pos / 100) * (max - min));
			onChange(val);
		}
	};

	return (
		<Box>
			<Flex justify="space-between" align="center" mb="1.5">
				<Text fontSize="11px" color="rgba(255, 255, 255, 0.35)" textTransform="uppercase" letterSpacing="0.05em">{label}</Text>
				{suffix && <Text fontSize="10px" color="rgba(255, 255, 255, 0.2)">{suffix}</Text>}
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
							<Slider.Track h="6px" borderRadius="full" bg="rgba(255, 255, 255, 0.06)">
								<Slider.Range bg="rgba(51, 129, 255, 0.5)" borderRadius="full" />
							</Slider.Track>
							<Slider.Thumb
								index={0}
								w="14px" h="14px" borderRadius="full"
								bg="#3381ff" borderWidth="2px" borderColor="#0f0f12"
								shadow="0 2px 8px rgba(51, 129, 255, 0.3)"
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
					bg="rgba(255, 255, 255, 0.03)" borderColor="rgba(255, 255, 255, 0.08)"
					color="rgba(255, 255, 255, 0.7)" fontFamily='"Geist Mono", monospace'
					fontSize="13px" borderRadius="lg" textAlign="right"
					_focus={{ borderColor: 'rgba(51, 129, 255, 0.4)', outline: 'none' }}
					min={min} max={max}
				/>
			</HStack>
		</Box>
	);
}

// ============================================================
// Main params panel
// ============================================================
const KV_QUANT_OPTIONS = Object.values(EKvQuantType);

interface ILaunchParamsPanelProps {
	mode: EParamsMode;
	// Current param values
	gpuLayers: number;
	contextSize: number;
	batchSize: number;
	ubatchSize: number;
	threads: number;
	threadsBatch: number;
	flashAttn: boolean;
	mlock: boolean;
	mmap: boolean;
	directIo: boolean;
	noWarmup: boolean;
	jinja: boolean;
	kvQuantK: EKvQuantType;
	kvQuantV: EKvQuantType;
	chatTemplate: string;
	extraArgs: string;
	parallelSlots: number;
	// Model metadata for slider ranges
	modelNLayers: number | null; // null if no model selected
	modelContextLength: number | null;
	// Device info
	deviceOptions: string[];
	deviceIdToName: Record<string, string>;
	selectedDevice: string;
	// Callbacks
	onParamChange: (key: string, value: number | string | boolean) => void;
}

export function LaunchParamsPanel({
	mode,
	gpuLayers, contextSize, batchSize, ubatchSize,
	threads, threadsBatch,
	flashAttn, mlock, mmap, directIo, noWarmup, jinja,
	kvQuantK, kvQuantV, chatTemplate, extraArgs,
	parallelSlots,
	modelNLayers, modelContextLength,
	deviceOptions, deviceIdToName, selectedDevice,
	onParamChange,
}: ILaunchParamsPanelProps) {
	const [showAdvanced, setShowAdvanced] = useState(false);
	const isTarget = mode === EParamsMode.TARGET;

	const maxLayers = modelNLayers ?? 999;
	const maxContext = modelContextLength ?? 131072;

	return (
		<VStack align="stretch" gap="4">
			<Text fontSize="12px" fontWeight="600" color="rgba(255, 255, 255, 0.5)" textTransform="uppercase" letterSpacing="0.05em">
				{isTarget ? 'Parameters' : 'Draft Parameters'}
			</Text>

			{/* Device selection — only if devices available */}
			{deviceOptions.length > 0 && (
				<Card>
					<SelectField
						label="Device"
						value={selectedDevice}
						options={deviceOptions}
						onChange={v => onParamChange('device', v)}
						mono
						optionLabels={deviceIdToName}
					/>
				</Card>
			)}

			{/* GPU Layers + Context — sliders when model is selected */}
			<Card>
				<VStack align="stretch" gap="4">
					{modelNLayers ? (
						<SliderNumberField
							label="GPU Layers"
							value={gpuLayers}
							onChange={v => onParamChange('gpuLayers', v)}
							min={0} max={maxLayers}
							suffix={`/ ${maxLayers} layers`}
						/>
					) : (
						<NumberField label="GPU Layers" value={gpuLayers} onChange={v => onParamChange('gpuLayers', v)} min={0} max={999} />
					)}
					{modelContextLength ? (
						<SliderNumberField
							label="Context Size"
							value={contextSize}
							onChange={v => onParamChange('contextSize', v)}
							min={0} max={maxContext}
							suffix={contextSize === 0 ? '0 = auto' : `/ ${(maxContext / 1024).toFixed(0)}k max`}
							logarithmic
						/>
					) : (
						<NumberField label="Context Size" value={contextSize} onChange={v => onParamChange('contextSize', v)} min={0} step={1024} suffix="0 = auto" />
					)}
				</VStack>
			</Card>

			{/* Batch sizes + threads */}
			<Card>
				<VStack align="stretch" gap="4">
					<Flex gap="4">
						<NumberField label="Batch Size" value={batchSize} onChange={v => onParamChange('batchSize', v)} min={1} step={256} />
						<NumberField label="Micro Batch" value={ubatchSize} onChange={v => onParamChange('ubatchSize', v)} min={1} step={64} />
					</Flex>
					<Flex gap="4">
						<NumberField label="Threads" value={threads} onChange={v => onParamChange('threads', v)} min={0} suffix="0 = auto" />
						<NumberField label="Threads (Batch)" value={threadsBatch} onChange={v => onParamChange('threadsBatch', v)} min={0} suffix="0 = auto" />
					</Flex>
				</VStack>
			</Card>

			{/* Toggle options */}
			<Card>
				<VStack align="stretch" gap="3">
					<Text fontSize="11px" color="rgba(255, 255, 255, 0.35)" textTransform="uppercase" letterSpacing="0.05em">Options</Text>
					<HStack gap="2" flexWrap="wrap">
						<ToggleChip label="Flash Attention" active={flashAttn} onClick={() => onParamChange('flashAttn', !flashAttn)} />
						<ToggleChip label="MLock" active={mlock} onClick={() => onParamChange('mlock', !mlock)} />
						<ToggleChip label="MMap" active={mmap} onClick={() => onParamChange('mmap', !mmap)} />
						<ToggleChip label="Direct I/O" active={directIo} onClick={() => onParamChange('directIo', !directIo)} />
						<ToggleChip label="No Warmup" active={noWarmup} onClick={() => onParamChange('noWarmup', !noWarmup)} />
						{isTarget && (
							<ToggleChip label="Jinja" active={jinja} onClick={() => onParamChange('jinja', !jinja)} />
						)}
					</HStack>
				</VStack>
			</Card>

			{/* KV quant */}
			<Card>
				<VStack align="stretch" gap="3">
					<Text fontSize="11px" color="rgba(255, 255, 255, 0.35)" textTransform="uppercase" letterSpacing="0.05em">KV Cache Quantization</Text>
					<Flex gap="4">
						<SelectField label="K Type" value={kvQuantK} options={KV_QUANT_OPTIONS} onChange={v => onParamChange('kvQuantK', v)} mono />
						<SelectField label="V Type" value={kvQuantV} options={KV_QUANT_OPTIONS} onChange={v => onParamChange('kvQuantV', v)} mono />
					</Flex>
				</VStack>
			</Card>

			{/* Parallel slots — target only */}
			{isTarget && (
				<Card>
					<NumberField label="Parallel Slots" value={parallelSlots} onChange={v => onParamChange('parallelSlots', v)} min={0} suffix="0 = server default" />
				</Card>
			)}

			{/* Advanced section */}
			<Box>
				<Button w="100%" size="sm" variant="ghost" justifyContent="space-between" color="rgba(255, 255, 255, 0.35)" _hover={{ color: 'rgba(255, 255, 255, 0.6)', bg: 'rgba(255, 255, 255, 0.03)' }} borderRadius="lg" fontSize="12px" onClick={() => setShowAdvanced(!showAdvanced)}>
					Advanced Options
					{showAdvanced ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
				</Button>
				{showAdvanced && (
					<Card>
						<VStack align="stretch" gap="3" mt="2">
							{isTarget && (
								<Box>
									<Text fontSize="11px" color="rgba(255, 255, 255, 0.35)" textTransform="uppercase" letterSpacing="0.05em" mb="1.5">Chat Template</Text>
									<Input placeholder="Auto-detect" size="sm" bg="rgba(255, 255, 255, 0.03)" borderColor="rgba(255, 255, 255, 0.08)" color="rgba(255, 255, 255, 0.7)" fontSize="12px" borderRadius="lg" _placeholder={{ color: 'rgba(255, 255, 255, 0.2)' }} _focus={{ borderColor: 'rgba(51, 129, 255, 0.4)', outline: 'none' }} value={chatTemplate} onChange={e => onParamChange('chatTemplate', e.target.value)} />
								</Box>
							)}
							<Box>
								<Text fontSize="11px" color="rgba(255, 255, 255, 0.35)" textTransform="uppercase" letterSpacing="0.05em" mb="1.5">Extra Arguments</Text>
								<Input placeholder="--some-flag value" size="sm" bg="rgba(255, 255, 255, 0.03)" borderColor="rgba(255, 255, 255, 0.08)" color="rgba(255, 255, 255, 0.7)" fontFamily='"Geist Mono", monospace' fontSize="12px" borderRadius="lg" _placeholder={{ color: 'rgba(255, 255, 255, 0.2)' }} _focus={{ borderColor: 'rgba(51, 129, 255, 0.4)', outline: 'none' }} value={extraArgs} onChange={e => onParamChange('extraArgs', e.target.value)} />
							</Box>
						</VStack>
					</Card>
				)}
			</Box>
		</VStack>
	);
}