import {
	EServerStatus,
	EKvQuantType,
	EValidationStatus,
	EDeviceBackendType,
	ESplitMode,
	ESpecType,
	EResponseFormat,
	EReasoningFormat,
	EReasoningEffort,
	ETheme,
} from './enums';
// ============================================================
// Identifiers
// ============================================================
export type TBackendId = string;
export type TServerId = string;
export type TPresetId = string;
export type TModelId = string;
export type TBackendGroupId = string;
// ============================================================
// Devices
// ============================================================
export interface IDevice {
	id: string;
	name: string;
	backendType: EDeviceBackendType;
	backendId: TBackendId; // which registered backend detected this
	computeCapability: string;
	vramTotalMb: number;
	vramFreeMb: number;
	connection: string; // "Integrated", "PCIe", "USB4 eGPU", etc.
}
// ============================================================
// Backends
// ============================================================
export interface IBackend {
	id: TBackendId;
	name: string;
	path: string; // absolute path to llama-server binary
	defaultArgs: string[];
	description: string;
	validation: EValidationStatus;
	version: string; // compiled GPU backends (e.g. 'CUDA, Vulkan')
	buildNumber: string; // llama.cpp build number (e.g. '9293')
	gitCommit: string; // git commit hash of this build (e.g. '1acee6bf8')
	detectedDevices: IDevice[];
	createdAt: number;
	updatedAt: number;
}
export interface IBackendCreatePayload {
	name: string;
	path: string;
	defaultArgs: string[];
	description: string;
}
export interface IBackendUpdatePayload {
	name?: string;
	path?: string;
	defaultArgs?: string[];
	description?: string;
}

export interface IBackendGroup {
	id: TBackendGroupId;
	name: string;
	description?: string;
	backendIds: TBackendId[];
	activeBackendId: TBackendId;
	createdAt: number;
	updatedAt: number;
}

export interface IBackendGroupCreatePayload {
	name: string;
	description?: string;
	backendIds: TBackendId[];
	activeBackendId: TBackendId;
}

export interface IBackendGroupUpdatePayload {
	name?: string;
	description?: string;
	backendIds?: TBackendId[];
	activeBackendId?: TBackendId;
}
// ============================================================
// GGUF Metadata (parsed from file headers)
// ============================================================
export interface IGgufMetadata {
	architecture: string;
	paramCount: string; // "27B", "122B (10B active)", etc.
	quantType: string; // "Q6_K_XL", "MXFP4", "IQ3_XXS", etc.
	nLayers: number;
	nKvHeads: number;
	embeddingDim: number;
	feedForwardDim: number;
	contextLength: number; // model's native max context
	fileSize: number; // bytes
	vocabSize: number; // tokenizer vocabulary size, 0 if unknown
}
// ============================================================
// Models (scanned from disk)
// ============================================================
// A single GGUF file on disk
export interface IGgufFile {
	fileName: string;
	filePath: string; // absolute path
	sizeMb: number;
	metadata: IGgufMetadata | null; // null if parse failed
	shardIndex: number | null; // 1-based, null if not a shard
	shardTotal: number | null;
	isMmproj: boolean;
	parentModel: string | null; // base name without shard suffix
}
// A model = a group of related GGUF files in one directory
export interface IModel {
	id: TModelId;
	user: string; // folder name (HF user)
	name: string; // folder name (HF model)
	dirPath: string; // absolute path to model dir
	files: IGgufFile[]; // all gguf files in this dir
	primaryFile: IGgufFile | null; // the main model file (auto-detected)
	mmprojFile: IGgufFile | null; // auto-detected mmproj, null if none
	totalSizeMb: number; // sum of all shards for primary model
	hfUrl?: string; // optional HuggingFace URL (for downloaded models)
	recommendedInferenceParams?: string; // CLI flags format: "--temperature 0.7 --top-p 0.9"
}
// ============================================================
// Speculative Decoding Params
// ============================================================
export interface ISpecDecodeParams {
	enabled: boolean;
	mode?: 'draft' | 'ngram' | 'mtp'; // undefined → 'draft' (backward compat)
	// Shared across modes
	draftMax: number; // max tokens to draft per step
	draftMin: number; // min tokens to draft per step
	// Draft-model-only
	draftModelPath: string; // path to draft GGUF file
	draftDevice: string; // empty = same as target, e.g. "CUDA0", "Vulkan0"
	draftGpuLayers: number;
	draftContextSize: number; // 0 = loaded from model
	draftPMin: number; // acceptance probability threshold (0.0-1.0)
	// Spec type for draft/MTP mode (e.g. "mtp" for Mamba Transition Prediction)
	specType?: ESpecType;
	// MTP-specific: max draft tokens per step (maps to --spec-draft-n-max)
	specDraftNMax?: number;
	// Ngram-only (optional)
	ngramSizeN?: number; // lookup n-gram length
	ngramSizeM?: number; // draft m-gram length
	ngramMinHits?: number; // min occurrences before drafting (ngram-map-k* only)
}
export const DEFAULT_SPEC_DECODE_PARAMS: ISpecDecodeParams = {
	enabled: false,
	draftModelPath: '',
	draftDevice: '',
	draftGpuLayers: 999,
	draftContextSize: 0,
	draftMax: 16,
	draftMin: 0,
	draftPMin: 0.75,
	specDraftNMax: 3,
};
// ============================================================
// Server Launch Params
// ============================================================
export interface ILaunchParams {
	gpuLayers: number;
	contextSize: number; // 0 = model default
	batchSize: number;
	ubatchSize: number;
	threads: number; // 0 = auto
	threadsBatch: number; // 0 = auto
	flashAttn: boolean;
	mlock: boolean;
	mmap: boolean;
	directIo: boolean;
	noWarmup: boolean;
	jinja: boolean;
	swaFull: boolean;
	kvQuantK: EKvQuantType;
	kvQuantV: EKvQuantType;
	chatTemplate: string; // empty = auto-detect from model
	port: number; // 0 = auto-assign
	device: string; // empty = default, e.g. "CUDA0", "Vulkan1"
	extraArgs: string; // free-form additional flags
	parallelSlots: number; // number of concurrent slots, 0 = server default
	specDecode: ISpecDecodeParams;
	// Multi-GPU split (optional for backward compatibility)
	gpuLayersAuto?: boolean; // true = autofit (omit -ngl), false/undefined = manual
	multiGpu?: boolean; // enables multi-GPU tensor split
	splitMode?: ESplitMode; // layer | row | tensor
	gpuSplitValues?: number[]; // per-GPU proportions, zeros exclude devices
	mainGpu?: number; // -1 = default, >=0 = explicit GPU index
}
// Default launch params
export const DEFAULT_LAUNCH_PARAMS: ILaunchParams = {
	gpuLayers: 999,
	contextSize: 0,
	batchSize: 2048,
	ubatchSize: 512,
	threads: 0,
	threadsBatch: 0,
	flashAttn: true,
	mlock: true,
	mmap: true,
	directIo: false,
	noWarmup: false,
	jinja: true,
	swaFull: false,
	kvQuantK: EKvQuantType.F16,
	kvQuantV: EKvQuantType.F16,
	chatTemplate: '',
	port: 0,
	device: '',
	extraArgs: '',
	parallelSlots: 4,
	specDecode: { ...DEFAULT_SPEC_DECODE_PARAMS },
};
// ============================================================
// Running Servers
// ============================================================
export interface IServer {
	id: TServerId;
	backendId?: TBackendId;
	backendGroupId?: TBackendGroupId;
	modelPath: string; // path to primary GGUF file
	serverName: string; // user-defined name, or auto-generated from model filename
	serverAlias: string[]; // aliases for proxy routing
	params: ILaunchParams;
	port: number; // actual assigned port
	pid: number | undefined; // OS process ID
	status: EServerStatus;
	startedAt: number | null;
	error: string | null;
	// Live stats (updated periodically)
	stats: IServerStats | null;
	// Auto-launch at startup (optional for backwards compatibility)
	autoLaunch?: boolean;
	// Auto checkpoint behavior (optional for backwards compatibility)
	autoSaveCheckpointOnStop?: boolean;
	autoLoadCheckpointOnStart?: boolean;
	// Full command line used to launch the server
	launchCommand?: string | null;
	// Whether to use recommended inference params from the model
	useRecommendedInferenceParams?: boolean;
	// Whether to use multi-modal mode (mmproj) if available
	useMultiModal?: boolean;
}
export interface ISlotStats {
	id: number;
	state: 'idle' | 'processing';
	tokensGenerated: number;
	tokensRemaining: number;
}
export interface IServerStats {
	slotsIdle: number;
	slotsProcessing: number;
	tokensGenerated: number;
	slots: ISlotStats[];
}
export interface IServerCreatePayload {
	backendId?: TBackendId;
	backendGroupId?: TBackendGroupId;
	modelPath: string;
	serverName: string | null; // null = auto-generate from model filename
	params: ILaunchParams;
	serverAlias?: string[]; // optional aliases for proxy routing
	autoLaunch?: boolean; // auto-launch at startup
	autoSaveCheckpointOnStop?: boolean; // save all slots as bundle on server stop
	autoLoadCheckpointOnStart?: boolean; // load latest checkpoint after server becomes ready
	useRecommendedInferenceParams?: boolean;
	useMultiModal?: boolean; // use mmproj if available
}
// ============================================================
// Presets
// ============================================================
export interface IPreset {
	id: TPresetId;
	name: string;
	backendId: TBackendId;
	modelPath: string;
	params: ILaunchParams;
	createdAt: number;
}
export interface IPresetCreatePayload {
	name: string;
	backendId: TBackendId;
	modelPath: string;
	params: ILaunchParams;
}
// ============================================================
// Settings
// ============================================================
export type TSortField = 'name' | 'recency' | 'backend';
export type TBackendSortField = 'name' | 'createdAt' | 'updatedAt';
export type TRecipeSortField = 'name' | 'createdAt' | 'updatedAt';
export type TCheckpointSortField = 'recency' | 'size' | 'name' | 'slot';
export type TSortOrder = 'asc' | 'desc';
export interface ISettings {
	modelRoots: string[];
	portRangeStart: number;
	portRangeEnd: number;
	apiHost: string;
	apiPort: number;
	proxyPort: number;
	proxyEnabled: boolean;
	proxyAuthEnabled: boolean;
	apiAuthEnabled: boolean;
	authRequireForLocalhost: boolean;
	serversSortField: TSortField;
	serversSortOrder: TSortOrder;
	backendsSortField: TBackendSortField;
	backendsSortOrder: TSortOrder;
	recipesSortField: TRecipeSortField;
	recipesSortOrder: TSortOrder;
	checkpointsSortField: TCheckpointSortField;
	checkpointsSortOrder: TSortOrder;
	startMinimized?: boolean; // only effective when auto-launch at startup is enabled
	sidebarCollapsed?: boolean; // sidebar collapsed state
	windowWidth?: number; // desktop window width (desktop only)
	windowHeight?: number; // desktop window height (desktop only)
	checkpointsPath?: string; // where to save KV cache checkpoints
	maxCheckpointDiskGB?: number; // max disk usage cap for checkpoints in GB
	disableTitleGen?: boolean; // if true, skip LLM title generation and use message truncation
	showRawJSONChatConfig?: boolean; // if true, show JSON editor instead of UI controls in chat config
	isOnboardingComplete?: boolean; // if false or undefined, show onboarding overlay
	theme?: ETheme;
	micDeviceId?: string; // app-level mic device selection for STT
	kokoroVoice?: string; // kokoro TTS voice selection
	kokoroSpeed?: number; // kokoro TTS speed multiplier
	builtinMcpPort?: number;
	builtinMcpExposeExternal?: boolean;
	fsAllowedRoots?: string[];
	appZoomLevel?: number;
	chatFontSize?: number;
	chatFontFamily?: string;
	chatFixedWidth?: boolean;
}
export const DEFAULT_SETTINGS: ISettings = {
	modelRoots: [],
	portRangeStart: 8010,
	portRangeEnd: 8099,
	apiHost: '0.0.0.0',
	apiPort: 4400,
	proxyPort: 1234,
	proxyEnabled: true,
	proxyAuthEnabled: false,
	apiAuthEnabled: false,
	authRequireForLocalhost: false,
	serversSortField: 'name',
	serversSortOrder: 'asc',
	backendsSortField: 'name',
	backendsSortOrder: 'asc',
	recipesSortField: 'name',
	recipesSortOrder: 'asc',
	checkpointsSortField: 'recency',
	checkpointsSortOrder: 'desc',
	startMinimized: false,
	sidebarCollapsed: true,
	windowWidth: 1100,
	windowHeight: 750,
	checkpointsPath: '',
	maxCheckpointDiskGB: 50,
	disableTitleGen: false,
	isOnboardingComplete: false,
	theme: ETheme.DARK,
	kokoroVoice: 'af_heart',
	kokoroSpeed: 1.0,
	builtinMcpPort: 11437,
	builtinMcpExposeExternal: false,
	fsAllowedRoots: [],
	appZoomLevel: 1.0,
	chatFontSize: 14,
	chatFontFamily: '',
	chatFixedWidth: false,
};
// ============================================================
// VRAM Calculator
// ============================================================
// Input params for oobabooga's VRAM prediction formula
export interface IVramEstimateInput {
	sizeInMb: number;
	nLayers: number;
	nKvHeads: number;
	embeddingDim: number;
	contextLength: number;
	cacheType: number; // 16 for f16, 8 for q8_0, 4 for q4_0
	gpuLayers: number;
}
export interface IVramEstimate {
	estimatedMb: number;
	safeEstimateMb: number; // + 577 MB safety buffer
	willFit: boolean;
	availableMb: number;
}
// ============================================================
// API Response Wrappers
// ============================================================
export interface IApiResponse<T> {
	ok: boolean;
	data: T;
	error: string | null;
}
export interface IApiListResponse<T> {
	ok: boolean;
	data: T[];
	total: number;
	error: string | null;
}

// ============================================================
// Chat Types Not in Bridge (by design)
// Bridge owns core chat types. These are WarpCore-specific extensions.
// ============================================================

// Create payloads - WarpCore API format
export interface IChatThreadCreatePayload {
	id?: string;
	title?: string;
	folderId?: string | null;
	serverId?: string | null;
	whisperServerId?: string | null;
	systemPrompt?: string;
	tags?: string[];
	totalPromptTokens?: number;
	totalCompletionTokens?: number;
}

import type { IMessagePart, TMessageId } from '@warpcore/bridge';

export interface IChatMessageCreatePayload {
	id?: TMessageId,
	role: string;
	parentId?: string | null;
	content: IMessagePart[];
	stats?: string;
}

// Thread config with typed params - WarpCore format
export interface IThreadConfig {
	threadId: string;
	presetId: string | null;
	systemPrompt: string;
	params: Partial<IChatInferenceParams>;
}

// ============================================================
// Chat Inference Params & Presets
// ============================================================
export interface IChatInferenceParams {
	temperature: number;
	topP: number;
	topK: number;
	minP: number;
	repeatPenalty: number;
	frequencyPenalty: number;
	presencePenalty: number;
	maxTokens: number;
	stopSequences: string[];
	seed: number;
	responseFormat: EResponseFormat;
	reasoningFormat: EReasoningFormat;
	enableThinking: boolean;
	reasoningEffort: EReasoningEffort;
	mirostatMode: number;
	mirostatTau: number;
	mirostatEta: number;
	cachePrompt: boolean;
	typicalP: number;
	ignoreEos: boolean;
	logitBias: number[][];
	dryMultiplier: number;
	dryBase: number;
	dryAllowedLength: number;
	dryPenaltyLastN: number;
	topNSigma: number;
	xtcProbability: number;
	xtcThreshold: number;
	dynatempRange: number;
	dynatempExponent: number;
	repeatLastN: number;
	n_probs: number;
	samplers: string[];
	grammar: string;
	jsonSchema: object;
	adaptiveTarget: number;
	adaptiveDecay: number;
	[key: string]: unknown;
}

export interface IChatPreset {
	id: string;
	name: string;
	systemPrompt: string;
	params: IChatInferenceParams;
	createdAt: number;
	updatedAt: number;
}

export interface IChatPresetCreatePayload {
	name: string;
	systemPrompt: string;
	params: IChatInferenceParams;
}

// ============================================================
// Access Tokens
// ============================================================

export type TAccessTokenId = string;

export interface IAccessToken {
	id: TAccessTokenId;
	name: string;
	tokenHash: string; // bcrypt hash of the raw token
	tokenPrefix: string; // first 11 chars for display (e.g. "wc_a3f8b2c9d")
	admin: boolean; // full admin access
	inference: true | string[]; // true = all servers, string[] = specific aliases/IDs
	mcp_labelled: true | string[]; // true = all tools, string[] = specific tools from mcp.json
	mcp_inline: true | string[]; // true = all tools, string[] = specific ephemeral tools
	createdAt: number;
}

// What the API returns (excludes tokenHash)
export interface IAccessTokenInfo {
	id: TAccessTokenId;
	name: string;
	tokenPrefix: string;
	admin: boolean;
	inference: true | string[];
	mcp_labelled: true | string[];
	mcp_inline: true | string[];
	createdAt: number;
}

export interface IAccessTokenCreatePayload {
	name: string;
	admin: boolean;
	inference: true | string[];
	mcp_labelled: true | string[];
	mcp_inline: true | string[];
}

export interface IAccessTokenUpdatePayload {
	name?: string;
	admin?: boolean;
	inference?: true | string[];
	mcp_labelled?: true | string[];
	mcp_inline?: true | string[];
}

// Returned only on create - includes the raw token (shown once)
export interface IAccessTokenCreateResult {
	token: string; // the raw Bearer token - shown once, never again
	info: IAccessTokenInfo;
}
export type TOs = 'win' | 'linux' | 'mac';
export type TArch = 'x64' | 'arm64';
export type TGpuVendor = 'nvidia' | 'amd' | 'intel' | 'apple' | 'unknown';
export interface IGpuInfo {
	vendor: TGpuVendor;
	name: string;
	driverVersion: string | null;
}
export interface IHardwareInfo {
	os: TOs;
	arch: TArch;
	gpus: IGpuInfo[];
}
export type TBackendKind = 'cuda' | 'rocm' | 'vulkan' | 'metal' | 'cpu' | 'hip' | 'sycl';
export type TReleaseSource = 'upstream' | 'lemonade';
export interface IBackendAsset {
	key: string;
	source: TReleaseSource;
	os: TOs;
	arch: TArch;
	backend: TBackendKind;
	backendVersion: string | null;
	gpuArch: string | null;
	llamaBuild: string;
	url: string;
	size: number;
	filename: string;
}
export interface IKokoroStatus {
	installed: boolean;
	basePath: string;
	modelPath: string;
	configPath: string;
	voicePaths: string[];
}
