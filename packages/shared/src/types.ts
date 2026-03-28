import {
	EServerStatus,
	EKvQuantType,
	EValidationStatus,
	EDeviceBackendType,
	EChatRole,
	EResponseFormat,
	EReasoningFormat,
	EReasoningEffort,
} from './enums';
// ============================================================
// Identifiers
// ============================================================
export type TBackendId = string;
export type TServerId = string;
export type TPresetId = string;
export type TModelId = string; // hash of file path
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
	version: string; // detected build version
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
}
// ============================================================
// Speculative Decoding Params
// ============================================================
export interface ISpecDecodeParams {
	enabled: boolean;
	draftModelPath: string; // path to draft GGUF file
	draftDevice: string; // empty = same as target, e.g. "CUDA0", "Vulkan0"
	draftGpuLayers: number;
	draftContextSize: number; // 0 = loaded from model
	draftMax: number; // max tokens to draft per step
	draftMin: number; // min tokens to draft per step
	draftPMin: number; // acceptance probability threshold (0.0-1.0)
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
	kvQuantK: EKvQuantType;
	kvQuantV: EKvQuantType;
	chatTemplate: string; // empty = auto-detect from model
	port: number; // 0 = auto-assign
	device: string; // empty = default, e.g. "CUDA0", "Vulkan1"
	extraArgs: string; // free-form additional flags
	parallelSlots: number; // number of concurrent slots, 0 = server default
	specDecode: ISpecDecodeParams;
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
	backendId: TBackendId;
	modelPath: string; // path to primary GGUF file
	mmprojPath: string | null;
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
	backendId: TBackendId;
	modelPath: string;
	mmprojPath: string | null;
	serverName: string | null; // null = auto-generate from model filename
	params: ILaunchParams;
	serverAlias?: string[]; // optional aliases for proxy routing
	autoLaunch?: boolean; // auto-launch at startup
}
// ============================================================
// Presets
// ============================================================
export interface IPreset {
	id: TPresetId;
	name: string;
	backendId: TBackendId;
	modelPath: string;
	mmprojPath: string | null;
	params: ILaunchParams;
	createdAt: number;
}
export interface IPresetCreatePayload {
	name: string;
	backendId: TBackendId;
	modelPath: string;
	mmprojPath: string | null;
	params: ILaunchParams;
}
// ============================================================
// Settings
// ============================================================
export type TSortField = 'name' | 'recency' | 'backend';
export type TSortOrder = 'asc' | 'desc';
export interface ISettings {
	modelRoots: string[];
	portRangeStart: number;
	portRangeEnd: number;
	apiHost: string;
	apiPort: number;
	proxyPort: number;
	proxyEnabled: boolean;
	serversSortField: TSortField;
	serversSortOrder: TSortOrder;
	startMinimized?: boolean; // only effective when auto-launch at startup is enabled
	sidebarCollapsed?: boolean; // sidebar collapsed state
	windowWidth?: number; // desktop window width (desktop only)
	windowHeight?: number; // desktop window height (desktop only)
}
export const DEFAULT_SETTINGS: ISettings = {
	modelRoots: [],
	portRangeStart: 8085,
	portRangeEnd: 8099,
	apiHost: '0.0.0.0',
	apiPort: 4400,
	proxyPort: 1234,
	proxyEnabled: true,
	serversSortField: 'name',
	serversSortOrder: 'asc',
	startMinimized: false,
	sidebarCollapsed: false,
	windowWidth: 1100,
	windowHeight: 750,
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
// Chat
// ============================================================
export type TChatThreadId = string;
export type TChatMessageId = string;
export type TChatFolderId = string;

export interface IChatThread {
	id: TChatThreadId;
	title: string;
	folderId: TChatFolderId | null;
	serverId: string | null;
	systemPrompt: string;
	tags: string[];
	messageCount: number;
	totalTokens: number;
	createdAt: number;
	updatedAt: number;
}

export interface IChatMessage {
	id: TChatMessageId;
	threadId: TChatThreadId;
	role: EChatRole;
	content: string;
	stats: string | null;
	createdAt: number;
}

export interface IChatFolder {
	id: TChatFolderId;
	name: string;
	parentId: TChatFolderId | null;
	sortOrder: number;
	createdAt: number;
}

export interface IChatThreadCreatePayload {
	id?: string;
	title?: string;
	folderId?: string | null;
	serverId?: string | null;
	systemPrompt?: string;
	tags?: string[];
}

export interface IChatMessageCreatePayload {
	role: EChatRole;
	content: string;
	stats?: string;
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

export interface IThreadConfig {
	threadId: string;
	presetId: string | null;
	systemPrompt: string;
	params: IChatInferenceParams;
}

export interface IChatMessageStats {
	promptTokens: number;
	completionTokens: number;
	promptPerSecond: number;
	predictedPerSecond: number;
}
