import { useState, useEffect, useCallback } from 'react';
import { Box, Flex, Text, HStack, VStack, Input, Textarea } from '@chakra-ui/react';
import { Settings, ChevronRight, ChevronLeft, Save, Trash2, Plus, RotateCcw } from 'lucide-react';
import {
	fetchChatPresets,
	createChatPreset,
	updateChatPreset as updateChatPresetApi,
	deleteChatPreset,
} from '../api/services';
import type { IChatPreset, IChatInferenceParams } from '@warpcore/shared';
import { EResponseFormat, EReasoningFormat, EReasoningEffort } from '@warpcore/shared';
import { VscLayoutSidebarRightOff } from 'react-icons/vsc';

// ============================================================
// Default params — must match the one in ChatPage
// ============================================================
export const DEFAULT_INFERENCE_PARAMS: IChatInferenceParams = {
	temperature: 1.0,
	topP: 1.0,
	topK: 40,
	minP: 0.0,
	repeatPenalty: 1.0,
	frequencyPenalty: 0.0,
	presencePenalty: 0.0,
	maxTokens: -1,
	stopSequences: [],
	seed: -1,
	responseFormat: EResponseFormat.TEXT,
	reasoningFormat: EReasoningFormat.NONE,
	enableThinking: false,
	mirostatMode: 0,
	mirostatTau: 5.0,
	mirostatEta: 0.1,
	cachePrompt: true,
	reasoningEffort: EReasoningEffort.NONE
};

interface IChatConfigSidebarProps {
	open: boolean;
	onToggle: () => void;
	params: IChatInferenceParams;
	systemPrompt: string;
	selectedPresetId: string | null;
	onParamsChange: (params: IChatInferenceParams) => void;
	onSystemPromptChange: (prompt: string) => void;
	onPresetSelect: (presetId: string | null, preset: IChatPreset | null) => void;
}

// ============================================================
// Slider row component
// ============================================================
function ParamSlider({ label, value, min, max, step, onChange }: {
	label: string;
	value: number;
	min: number;
	max: number;
	step: number;
	onChange: (v: number) => void;
}) {
	return (
		<Box>
			<HStack justify="space-between" mb="1">
				<Text fontSize="12px" color="rgba(255,255,255,0.5)">{label}</Text>
				<Input
					size="xs"
					w="60px"
					textAlign="right"
					fontFamily="mono"
					fontSize="12px"
					value={value}
					onChange={(e) => {
						const v = parseFloat(e.target.value);
						if (!isNaN(v)) onChange(v);
					}}
					bg="rgba(255,255,255,0.04)"
					borderColor="rgba(255,255,255,0.08)"
					color="rgba(255,255,255,0.8)"
					px="2"
					h="24px"
				/>
			</HStack>
			<input
				type="range"
				min={min}
				max={max}
				step={step}
				value={value}
				onChange={(e) => onChange(parseFloat(e.target.value))}
				style={{ width: '100%', accentColor: '#666' }}
			/>
		</Box>
	);
}

// ============================================================
// Select row component
// ============================================================
function ParamSelect({ label, value, options, onChange }: {
	label: string;
	value: string;
	options: { value: string; label: string }[];
	onChange: (v: string) => void;
}) {
	return (
		<Box>
			<Text fontSize="12px" color="rgba(255,255,255,0.5)" mb="1">{label}</Text>
			<select
				value={value}
				onChange={(e) => onChange(e.target.value)}
				style={{
					width: '100%',
					background: 'rgba(255,255,255,0.04)',
					border: '1px solid rgba(255,255,255,0.08)',
					borderRadius: '6px',
					color: 'rgba(255,255,255,0.8)',
					fontSize: '12px',
					padding: '4px 8px',
					height: '28px',
				}}
			>
				{options.map((o) => <option key={o.value} value={o.value} style={{ background: '#1a1a1a' }}>{o.label}</option>)}
			</select>
		</Box>
	);
}

// ============================================================
// Toggle row component
// ============================================================
function ParamToggle({ label, value, onChange }: {
	label: string;
	value: boolean;
	onChange: (v: boolean) => void;
}) {
	return (
		<HStack justify="space-between">
			<Text fontSize="12px" color="rgba(255,255,255,0.5)">{label}</Text>
			<Box
				w="36px" h="20px" borderRadius="full" cursor="pointer"
				bg={value ? 'rgba(100,200,100,0.4)' : 'rgba(255,255,255,0.08)'}
				position="relative"
				onClick={() => onChange(!value)}
				transition="background 0.15s"
			>
				<Box
					w="16px" h="16px" borderRadius="full" bg="white"
					position="absolute" top="2px"
					left={value ? '18px' : '2px'}
					transition="left 0.15s"
				/>
			</Box>
		</HStack>
	);
}

// ============================================================
// Section header
// ============================================================
function SectionHeader({ title, collapsed, onToggle }: { title: string; collapsed?: boolean; onToggle?: () => void }) {
	return (
		<HStack
			py="1.5"
			cursor={onToggle ? 'pointer' : 'default'}
			onClick={onToggle}
			userSelect="none"
		>
			{onToggle && (
				<ChevronRight
					size={12}
					style={{
						opacity: 0.4,
						transform: collapsed ? 'rotate(0deg)' : 'rotate(90deg)',
						transition: 'transform 0.15s',
					}}
				/>
			)}
			<Text fontSize="11px" fontWeight="600" color="rgba(255,255,255,0.4)" textTransform="uppercase" letterSpacing="0.05em">
				{title}
			</Text>
		</HStack>
	);
}

// ============================================================
// Main sidebar component
// ============================================================
export function ChatConfigSidebar({
	open,
	onToggle,
	params,
	systemPrompt,
	selectedPresetId,
	onParamsChange,
	onSystemPromptChange,
	onPresetSelect,
}: IChatConfigSidebarProps) {
	const [presets, setPresets] = useState<IChatPreset[]>([]);
	const [advancedOpen, setAdvancedOpen] = useState(false);
	const [savePresetName, setSavePresetName] = useState('');
	const [showSaveInput, setShowSaveInput] = useState(false);

	const loadPresets = useCallback(async () => {
		const res = await fetchChatPresets();
		if (res.ok) setPresets(res.data as IChatPreset[]);
	}, []);

	useEffect(() => { loadPresets(); }, [loadPresets]);

	function updateParam<K extends keyof IChatInferenceParams>(key: K, value: IChatInferenceParams[K]) {
		onParamsChange({ ...params, [key]: value });
	}

	async function handleSavePreset() {
		if (!savePresetName.trim()) return;
		await createChatPreset({
			name: savePresetName.trim(),
			systemPrompt,
			params,
		});
		setSavePresetName('');
		setShowSaveInput(false);
		await loadPresets();
	}

	async function handleDeletePreset(id: string) {
		await deleteChatPreset(id);
		if (selectedPresetId === id) onPresetSelect(null, null);
		await loadPresets();
	}

	function handlePresetChange(presetId: string) {
		if (presetId === '') {
			onPresetSelect(null, null);
			return;
		}
		const preset = presets.find((p) => p.id === presetId);
		if (preset) onPresetSelect(preset.id, preset);
	}

	if (!open) {
		return (
			<Box
				w="60px" minW="60px" h="100%"
				borderLeftWidth="1px" borderColor="rgba(255,255,255,0.06)"
				// bg="rgba(0,0,0,0.15)"
				display="flex" alignItems="flex-start" justifyContent="center"
				pt="6" cursor="pointer"
				onClick={onToggle}
				_hover={{ bg: 'rgba(255,255,255,0.03)' }}
			>
				<VscLayoutSidebarRightOff size={20} style={{ opacity: 0.4 }} />
			</Box>
		);
	}

	return (
		<Box
			w="300px" minW="300px" h="100%"
			borderLeftWidth="1px" borderColor="rgba(255,255,255,0.06)"
			bg="rgba(0,0,0,0.15)"
			overflowY="auto"
			css={{ '&::-webkit-scrollbar': { width: '4px' }, '&::-webkit-scrollbar-thumb': { background: 'rgba(255,255,255,0.1)', borderRadius: '2px' } }}
		>
			{/* Header */}
			<HStack px="3" py="2.5" borderBottomWidth="1px" borderColor="rgba(255,255,255,0.06)" justify="space-between">
				<HStack gap="2">
					<Settings size={14} style={{ opacity: 0.5 }} />
					<Text fontSize="12px" fontWeight="600" color="rgba(255,255,255,0.6)">Config</Text>
				</HStack>
				<Box cursor="pointer" onClick={onToggle} _hover={{ opacity: 0.8 }} opacity={0.4}>
					<ChevronRight size={14} />
				</Box>
			</HStack>

			<VStack gap="3" p="3" align="stretch">
				{/* Preset selector */}
				<Box>
					<SectionHeader title="Preset" />
					<HStack gap="1">
						<select
							value={selectedPresetId ?? ''}
							onChange={(e) => handlePresetChange(e.target.value)}
							style={{
								flex: 1,
								background: 'rgba(255,255,255,0.04)',
								border: '1px solid rgba(255,255,255,0.08)',
								borderRadius: '6px',
								color: 'rgba(255,255,255,0.8)',
								fontSize: '12px',
								padding: '4px 8px',
								height: '28px',
							}}
						>
							<option value="" style={{ background: '#1a1a1a' }}>None (custom)</option>
							{presets.map((p) => (
								<option key={p.id} value={p.id} style={{ background: '#1a1a1a' }}>{p.name}</option>
							))}
						</select>
						{selectedPresetId && (
							<Box cursor="pointer" onClick={() => handleDeletePreset(selectedPresetId)} _hover={{ opacity: 0.8 }} opacity={0.4} p="1">
								<Trash2 size={13} />
							</Box>
						)}
						{!showSaveInput && (
							<Box cursor="pointer" onClick={() => setShowSaveInput(true)} _hover={{ opacity: 0.8 }} opacity={0.4} p="1">
								<Plus size={13} />
							</Box>
						)}
					</HStack>
					{showSaveInput && (
						<HStack mt="1.5" gap="1">
							<Input
								size="xs"
								placeholder="Preset name..."
								value={savePresetName}
								onChange={(e) => setSavePresetName(e.target.value)}
								onKeyDown={(e) => { if (e.key === 'Enter') handleSavePreset(); if (e.key === 'Escape') setShowSaveInput(false); }}
								bg="rgba(255,255,255,0.04)"
								borderColor="rgba(255,255,255,0.08)"
								color="rgba(255,255,255,0.8)"
								fontSize="12px"
								h="26px"
								autoFocus
							/>
							<Box cursor="pointer" onClick={handleSavePreset} _hover={{ opacity: 0.8 }} opacity={0.4} p="1">
								<Save size={13} />
							</Box>
						</HStack>
					)}
				</Box>

				{/* System Prompt */}
				<Box>
					<SectionHeader title="System Prompt" />
					<Textarea
						value={systemPrompt}
						onChange={(e) => onSystemPromptChange(e.target.value)}
						placeholder="You are a helpful assistant..."
						fontSize="12px"
						bg="rgba(255,255,255,0.04)"
						borderColor="rgba(255,255,255,0.08)"
						color="rgba(255,255,255,0.8)"
						minH="80px"
						maxH="200px"
						resize="vertical"
						p="2"
					/>
				</Box>

				{/* Sampling */}
				<Box>
					<SectionHeader title="Sampling" />
					<VStack gap="2.5" align="stretch">
						<ParamSlider label="Temperature" value={params.temperature} min={0} max={2} step={0.05} onChange={(v) => updateParam('temperature', v)} />
						<ParamSlider label="Top P" value={params.topP} min={0} max={1} step={0.05} onChange={(v) => updateParam('topP', v)} />
						<ParamSlider label="Top K" value={params.topK} min={0} max={200} step={1} onChange={(v) => updateParam('topK', v)} />
						<ParamSlider label="Min P" value={params.minP} min={0} max={1} step={0.01} onChange={(v) => updateParam('minP', v)} />
						<ParamSlider label="Repeat Penalty" value={params.repeatPenalty} min={1} max={2} step={0.05} onChange={(v) => updateParam('repeatPenalty', v)} />
						<ParamSlider label="Frequency Penalty" value={params.frequencyPenalty} min={0} max={2} step={0.05} onChange={(v) => updateParam('frequencyPenalty', v)} />
						<ParamSlider label="Presence Penalty" value={params.presencePenalty} min={0} max={2} step={0.05} onChange={(v) => updateParam('presencePenalty', v)} />
					</VStack>
				</Box>

				{/* Generation */}
				<Box>
					<SectionHeader title="Generation" />
					<VStack gap="2.5" align="stretch">
						<Box>
							<Text fontSize="12px" color="rgba(255,255,255,0.5)" mb="1">Max Tokens (-1 = unlimited)</Text>
							<Input
								size="xs"
								fontFamily="mono"
								fontSize="12px"
								value={params.maxTokens}
								onChange={(e) => { const v = parseInt(e.target.value); if (!isNaN(v)) updateParam('maxTokens', v); }}
								bg="rgba(255,255,255,0.04)"
								borderColor="rgba(255,255,255,0.08)"
								color="rgba(255,255,255,0.8)"
								h="28px"
							/>
						</Box>
						<Box>
							<Text fontSize="12px" color="rgba(255,255,255,0.5)" mb="1">Seed (-1 = random)</Text>
							<Input
								size="xs"
								fontFamily="mono"
								fontSize="12px"
								value={params.seed}
								onChange={(e) => { const v = parseInt(e.target.value); if (!isNaN(v)) updateParam('seed', v); }}
								bg="rgba(255,255,255,0.04)"
								borderColor="rgba(255,255,255,0.08)"
								color="rgba(255,255,255,0.8)"
								h="28px"
							/>
						</Box>
						<ParamSelect
							label="Response Format"
							value={params.responseFormat}
							options={[
								{ value: EResponseFormat.TEXT, label: 'Text' },
								{ value: EResponseFormat.JSON_OBJECT, label: 'JSON Object' },
								{ value: EResponseFormat.JSON_SCHEMA, label: 'JSON Schema' },
							]}
							onChange={(v) => updateParam('responseFormat', v as EResponseFormat)}
						/>
					</VStack>
				</Box>

				{/* Thinking Models */}
				<Box>
					<SectionHeader title="Thinking Models" />
					<VStack gap="2.5" align="stretch">
						<ParamToggle label="Enable Thinking" value={params.enableThinking} onChange={(v) => updateParam('enableThinking', v)} />
						<ParamSelect
							label="Reasoning Effort"
							value={params.reasoningEffort}
							options={[
								{ value: EReasoningEffort.NONE, label: 'None' },
								{ value: EReasoningEffort.LOW, label: 'Low' },
								{ value: EReasoningEffort.MEDIUM, label: 'Medium' },
								{ value: EReasoningEffort.HIGH, label: 'High' },
							]}
							onChange={(v) => updateParam('reasoningEffort', v as EReasoningEffort)}
						/>
						<ParamSelect
							label="Reasoning Format"
							value={params.reasoningFormat}
							options={[
								{ value: EReasoningFormat.NONE, label: 'None' },
								{ value: EReasoningFormat.PARSED, label: 'Parsed' },
								{ value: EReasoningFormat.RAW, label: 'Raw' },
							]}
							onChange={(v) => updateParam('reasoningFormat', v as EReasoningFormat)}
						/>
					</VStack>
				</Box>

				{/* Advanced */}
				<Box>
					<SectionHeader title="Advanced" collapsed={!advancedOpen} onToggle={() => setAdvancedOpen(!advancedOpen)} />
					{advancedOpen && (
						<VStack gap="2.5" align="stretch">
							<ParamSelect
								label="Mirostat Mode"
								value={String(params.mirostatMode)}
								options={[
									{ value: '0', label: 'Disabled' },
									{ value: '1', label: 'Mirostat 1' },
									{ value: '2', label: 'Mirostat 2' },
								]}
								onChange={(v) => updateParam('mirostatMode', parseInt(v))}
							/>
							{params.mirostatMode > 0 && (
								<>
									<ParamSlider label="Mirostat Tau" value={params.mirostatTau} min={0} max={10} step={0.1} onChange={(v) => updateParam('mirostatTau', v)} />
									<ParamSlider label="Mirostat Eta" value={params.mirostatEta} min={0} max={1} step={0.01} onChange={(v) => updateParam('mirostatEta', v)} />
								</>
							)}
							<ParamToggle label="Cache Prompt" value={params.cachePrompt} onChange={(v) => updateParam('cachePrompt', v)} />
						</VStack>
					)}
				</Box>

				{/* Reset to defaults */}
				<HStack
					gap="1.5" cursor="pointer" opacity={0.4} _hover={{ opacity: 0.7 }}
					onClick={() => { onParamsChange({ ...DEFAULT_INFERENCE_PARAMS }); onSystemPromptChange(''); }}
					pb="2"
				>
					<RotateCcw size={12} />
					<Text fontSize="11px">Reset to defaults</Text>
				</HStack>
			</VStack>
		</Box>
	);
}