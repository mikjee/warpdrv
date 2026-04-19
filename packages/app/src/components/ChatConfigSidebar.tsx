import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Box, Flex, Text, HStack, VStack, Input, Textarea, IconButton, SegmentGroup } from '@chakra-ui/react';
import { Settings, ChevronRight, ChevronLeft, Save, Trash2, Plus, RotateCcw } from 'lucide-react';
import { LuCode, LuLayoutGrid } from 'react-icons/lu';
import {
	fetchChatPresets,
	createChatPreset,
	updateChatPreset as updateChatPresetApi,
	deleteChatPreset,
	fetchSettings,
	updateSettings,
	fetchModels,
} from '../api/services';
import type { IChatPreset, IChatInferenceParams, ISettings, IModel } from '@warpcore/shared';
import { EResponseFormat, EReasoningFormat, EReasoningEffort } from '@warpcore/shared';
import { VscLayoutSidebarRightOff } from 'react-icons/vsc';
import { useJsonValidator } from '@/hooks/useJsonValidator';
import { useStore } from '@/store';
import { useQuery, useListQuery } from '@/hooks/useQuery';
import { useDependantState } from "@/hooks/useDependantState";

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
	reasoningEffort: EReasoningEffort.NONE,
	typicalP: 1.0,
	ignoreEos: false,
	logitBias: [],
	dryMultiplier: 0.0,
	dryBase: 1.75,
	dryAllowedLength: 64,
	dryPenaltyLastN: 0,
	topNSigma: -1,
	xtcProbability: 0.0,
	xtcThreshold: 0.1,
	dynatempRange: 0.0,
	dynatempExponent: 1.0,
	repeatLastN: 64,
	n_probs: 0,
	samplers: [],
	grammar: '',
	jsonSchema: {},
	adaptiveTarget: 1.0,
	adaptiveDecay: 1.0,
	extraSamplingParams: {},
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
	const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
		const v = parseFloat(e.target.value);
		if (!isNaN(v)) onChange(v);
	}, [onChange]);

	const handleSliderChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
		onChange(parseFloat(e.target.value));
	}, [onChange]);

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
					onChange={handleInputChange}
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
				onChange={handleSliderChange}
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
				onChange={e => onChange(e.target.value)}
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
// Content panel for tabbed sidebar (no header, no toggle strip)
// ============================================================
interface IChatConfigContentPanelProps {
	params: IChatInferenceParams;
	systemPrompt: string;
	selectedPresetId: string | null;
	onParamsChange: (params: IChatInferenceParams) => void;
	onSystemPromptChange: (prompt: string) => void;
	onPresetSelect: (presetId: string | null, preset: IChatPreset | null) => void;
}

export function ChatConfigContentPanel({
	params,
	systemPrompt,
	selectedPresetId,
	onParamsChange,
	onSystemPromptChange,
	onPresetSelect,
}: IChatConfigContentPanelProps) {
	const [presets, setPresets] = useState<IChatPreset[]>([]);
	const [advancedOpen, setAdvancedOpen] = useState(false);
	const [savePresetName, setSavePresetName] = useState('');
	const [showSaveInput, setShowSaveInput] = useState(false);
	const [settings, setSettingsState] = useState<ISettings | null>(null);
	const currentServer = useStore(s => s.currentServerId ? s.servers[s.currentServerId] : null);

	const showRawJSON = settings?.showRawJSONChatConfig ?? false;

	const loadSettings = useCallback(async () => {
		const res = await fetchSettings();
		if (res.ok && res.data) {
			setSettingsState(res.data);
		}
	}, []);

	useEffect(() => { loadSettings(); }, [loadSettings]);

	const setSettings = useCallback((partial: Partial<ISettings>) => {
		updateSettings(partial).then(r => {
			if (r.ok && r.data) {
				setSettingsState(r.data);
			}
		});
	}, []);

	const { data: models } = useListQuery<IModel>(fetchModels, { pollInterval: 0 });

	const currentModel = useMemo(() => {
		if (!currentServer || !models) return null;
		return models.find(m => m.primaryFile?.filePath === currentServer.modelPath) || null;
	}, [currentServer, models]);

	const displayParams = useMemo((): IChatInferenceParams => {
		let base: IChatInferenceParams;
		if (currentServer) {
			if (currentServer.useRecommendedInferenceParams === true && currentModel?.recommendedInferenceParams) {
				base = { ...DEFAULT_INFERENCE_PARAMS, ...currentModel.recommendedInferenceParams };
			} else if (currentServer.launchInferenceParams) {
				base = { ...DEFAULT_INFERENCE_PARAMS, ...currentServer.launchInferenceParams };
			} else {
				base = { ...DEFAULT_INFERENCE_PARAMS };
			}
		} else {
			base = { ...DEFAULT_INFERENCE_PARAMS };
		}
		
		return { ...base, ...params };
	}, [params, currentServer, currentModel]);

	const { error: jsonError, validateAndParse, clearError } = useJsonValidator<Partial<IChatInferenceParams>>();

	const loadPresets = useCallback(async () => {
		const res = await fetchChatPresets();
		if (res.ok) setPresets(res.data as IChatPreset[]);
	}, []);

	useEffect(() => { loadPresets(); }, [loadPresets]);

	const updateParam = useCallback((key: keyof IChatInferenceParams, value: IChatInferenceParams[keyof IChatInferenceParams]) => {
		onParamsChange({ ...params, [key]: value });
	}, [params, onParamsChange]);

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

	const paramsStr = useMemo(() => JSON.stringify(params, null, 2), [params]);

	const [
		draftParamsStr,
		setDraftParamsStr,
	 ] = useDependantState<string>(paramsStr);

	return (
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

			{/* Inference Params View Mode */}
			<Box mt="4">
				<SectionHeader title="Inference Params" />
				<Box mt="2">
					<SegmentGroup.Root
						value={showRawJSON ? 'json' : 'ui'}
						onValueChange={(details) => setSettings({ showRawJSONChatConfig: details.value === 'json' })}
						size={"sm"}
						w="full"
					>
						<SegmentGroup.Indicator />
						<SegmentGroup.Items
							flex={"content"}
							items={[
								{
									value: 'ui',
									label: (
										<HStack gap="1.5">
											<LuLayoutGrid size={14} />
											<Text fontSize="12px">Controls</Text>
										</HStack>
									),
								},
								{
									value: 'json',
									label: (
										<HStack gap="1.5">
											<LuCode size={14} />
											<Text fontSize="12px">Raw</Text>
										</HStack>
									),
								},
							]}
						/>
					</SegmentGroup.Root>
				</Box>

				{showRawJSON && (
					<Box mt="2">
						<Textarea
							spellCheck="false"
							value={draftParamsStr}
							onChange={(e) => {
								const str = e.target.value;
								setDraftParamsStr(str);
								const result = validateAndParse(str);
								if (result.valid && result.parsed) clearError();
							}}

							onBlur={(e) => {
								const str = e.target.value;
								const result = validateAndParse(str);
								if (result.valid && result.parsed) {
									onParamsChange(result.parsed as IChatInferenceParams);
									clearError();
								}
							}}
							placeholder='{"temperature": 0.7, "topP": 0.9}'
							fontFamily="mono"
							fontSize="11px"
							bg="rgba(255,255,255,0.04)"
							borderColor={jsonError ? 'rgba(244, 63, 94, 0.5)' : 'rgba(255,255,255,0.08)'}
							color="rgba(255,255,255,0.8)"
							minH="200px"
							resize="vertical"
							p="2"
						/>
						{jsonError && (
							<Text fontSize="10px" color="rgba(244, 63, 94, 0.9)" mt="1" fontFamily="mono">
								{jsonError}
							</Text>
						)}
						<Text fontSize="10px" color="rgba(255,255,255,0.3)" mt="1">
							Edit JSON directly. Only non-default values are saved as overrides.
						</Text>
					</Box>
				)}
			</Box>

			{!showRawJSON && (
				<>
					{/* Sampling */}
					<Box>
						<SectionHeader title="Sampling" />
						<VStack gap="2.5" align="stretch">
							<ParamSlider label="Temperature" value={displayParams.temperature} min={0} max={2} step={0.05} onChange={(v) => updateParam('temperature', v)} />
							<ParamSlider label="Top P" value={displayParams.topP} min={0} max={1} step={0.05} onChange={(v) => updateParam('topP', v)} />
							<ParamSlider label="Top K" value={displayParams.topK} min={0} max={200} step={1} onChange={(v) => updateParam('topK', v)} />
							<ParamSlider label="Min P" value={displayParams.minP} min={0} max={1} step={0.01} onChange={(v) => updateParam('minP', v)} />
							<ParamSlider label="Repeat Penalty" value={displayParams.repeatPenalty} min={1} max={2} step={0.05} onChange={(v) => updateParam('repeatPenalty', v)} />
							<ParamSlider label="Frequency Penalty" value={displayParams.frequencyPenalty} min={0} max={2} step={0.05} onChange={(v) => updateParam('frequencyPenalty', v)} />
							<ParamSlider label="Presence Penalty" value={displayParams.presencePenalty} min={0} max={2} step={0.05} onChange={(v) => updateParam('presencePenalty', v)} />
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
		value={displayParams.maxTokens}
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
		value={displayParams.seed}
								onChange={(e) => { const v = parseInt(e.target.value); if (!isNaN(v)) updateParam('seed', v); }}
									bg="rgba(255,255,255,0.04)"
									borderColor="rgba(255,255,255,0.08)"
									color="rgba(255,255,255,0.8)"
									h="28px"
								/>
							</Box>
							<ParamSelect
								label="Response Format"
		value={displayParams.responseFormat}
								options={[
									{ value: EResponseFormat.TEXT, label: 'Text' },
									{ value: EResponseFormat.JSON_OBJECT, label: 'JSON' },
								]}
								onChange={(v) => updateParam('responseFormat', v as EResponseFormat)}
							/>

						<Box>
							<ParamToggle label="Enable Thinking" value={displayParams.enableThinking} onChange={(v) => updateParam('enableThinking', v)} />
							{displayParams.enableThinking && (
								<ParamSelect
									label="Reasoning Effort"
									value={displayParams.reasoningEffort}
									options={[
										{ value: EReasoningEffort.NONE, label: 'None' },
										{ value: EReasoningEffort.LOW, label: 'Low' },
										{ value: EReasoningEffort.MEDIUM, label: 'Medium' },
										{ value: EReasoningEffort.HIGH, label: 'High' },
									]}
									onChange={(v) => updateParam('reasoningEffort', v as EReasoningEffort)}
								/>
							)}
						</Box>

						<Box>
							<ParamSelect
								label="Reasoning Format"
								value={displayParams.reasoningFormat}
								options={[
									{ value: EReasoningFormat.NONE, label: 'None' },
									{ value: EReasoningFormat.PARSED, label: 'Parsed' },
									{ value: EReasoningFormat.RAW, label: 'Raw' },
								]}
								onChange={(v) => updateParam('reasoningFormat', v as EReasoningFormat)}
							/>
						</Box>
					</VStack>
					</Box>

					{/* Advanced */}
					<Box>
						<SectionHeader title="Advanced" collapsed={!advancedOpen} onToggle={() => setAdvancedOpen(!advancedOpen)} />
						{advancedOpen && (
							<VStack gap="2.5" align="stretch">
								<ParamSelect
									label="Mirostat Mode"
									value={String(displayParams.mirostatMode)}
									options={[
										{ value: '0', label: 'Disabled' },
										{ value: '1', label: 'Mirostat 1' },
										{ value: '2', label: 'Mirostat 2' },
									]}
									onChange={(v) => updateParam('mirostatMode', parseInt(v))}
								/>
								{displayParams.mirostatMode > 0 && (
									<>
										<ParamSlider label="Mirostat Tau" value={displayParams.mirostatTau} min={0} max={10} step={0.1} onChange={(v) => updateParam('mirostatTau', v)} />
										<ParamSlider label="Mirostat Eta" value={displayParams.mirostatEta} min={0} max={1} step={0.01} onChange={(v) => updateParam('mirostatEta', v)} />
									</>
								)}
								<ParamToggle label="Cache Prompt" value={displayParams.cachePrompt} onChange={(v) => updateParam('cachePrompt', v)} />
							</VStack>
						)}
					</Box>
				</>
			)}

			{/* Reset to defaults */}
			<HStack
				gap="1.5"
				cursor="pointer"
				opacity={0.4}
				_hover={{ opacity: 0.7 }}
				onClick={() => { onParamsChange({ ...DEFAULT_INFERENCE_PARAMS }); onSystemPromptChange(''); }}
				pb="2"
			>
				<RotateCcw size={12} />
				<Text fontSize="11px">Reset to defaults</Text>
			</HStack>
		</VStack>
	);
}