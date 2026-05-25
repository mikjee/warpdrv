// Server process status
export enum EServerStatus {
	STOPPED = 'STOPPED',
	LOADING = 'LOADING',
	RUNNING = 'RUNNING',
	ERROR = 'ERROR',
}

// KV cache quantization types supported by llama-server
export enum EKvQuantType {
	F16 = 'f16',
	Q8_0 = 'q8_0',
	Q4_0 = 'q4_0',
	Q4_1 = 'q4_1',
	IQ4_NL = 'iq4_nl',
	Q5_0 = 'q5_0',
	Q5_1 = 'q5_1',
}

// Backend validation status
export enum EValidationStatus {
	IDLE = 'IDLE',
	CHECKING = 'CHECKING',
	VALID = 'VALID',
	INVALID = 'INVALID',
}

// Device backend type
export enum EDeviceBackendType {
	CUDA = 'CUDA',
	ROCM = 'ROCm',
	VULKAN = 'Vulkan',
}

// Multi-GPU split mode for llama.cpp
export enum ESplitMode {
	LAYER = 'layer',
	ROW = 'row',
	TENSOR = 'tensor',
}

// Speculative decoding types for llama.cpp
export enum ESpecType {
	NONE = 'none',
	NGRAM_SIMPLE = 'ngram-simple',
	NGRAM_CACHE = 'ngram-cache',
	NGRAM_MAP_K = 'ngram-map-k',
	NGRAM_MAP_K4V = 'ngram-map-k4v',
	NGRAM_MOD = 'ngram-mod',
	MTP = 'mtp',
}

// Re-export from hub-types
export { EDownloadStatus } from './hub-types';

// Chat inference enums (kept in shared - not chat-specific)
// Note: EChatRole, EMcpTransportType, EMcpServerStatus, EToolApprovalMode,
// and EToolCallStatus have been moved to @warpcore/bridge
export enum EResponseFormat {
	TEXT = 'text',
	JSON_OBJECT = 'json_object',
	JSON_SCHEMA = 'json_schema',
}

export enum EReasoningFormat {
	NONE = 'none',
	PARSED = 'parsed',
	RAW = 'raw',
}

export enum EReasoningEffort {
	NONE = 'none',
	LOW = 'low',
	MEDIUM = 'medium',
	HIGH = 'high',
}

// App theme
export enum ETheme {
	DARK = 'dark',
	LIGHT = 'light',
	GITHUB_DARK = 'github-dark',
	GITHUB_LIGHT = 'github-light',
	ONE_DARK = 'one-dark',
	ONE_LIGHT = 'one-light',
	DRACULA_DARK = 'dracula-dark',
	DRACULA_LIGHT = 'dracula-light',
	CATPPUCCIN_MOCHA = 'catppuccin-mocha',
	CATPPUCCIN_LATTE = 'catppuccin-latte',
	NORD = 'nord',
	NORD_LIGHT = 'nord-light',
	TOKYO_NIGHT = 'tokyo-night',
	TOKYO_NIGHT_LIGHT = 'tokyo-night-light',
	AMOLED = 'amoled',
	VESPER = 'vesper',
	MIN = 'min',
	GRUVBOX_HARD = 'gruvbox-hard',
	ROSE_PINE = 'rose-pine',
	KANAGAWA = 'kanagawa',
	OBSIDIAN = 'obsidian',
	MONOKAI_PRO = 'monokai-pro',
	PALENIGHT = 'palenight',
	SOLARIZED_DARK = 'solarized-dark',
	GRUVBOX = 'gruvbox',
	KIMBIE_DARK = 'kimbie-dark',
	EVERFOREST_HARD = 'everforest-hard',
	SOLARIZED_LIGHT = 'solarized-light',
}