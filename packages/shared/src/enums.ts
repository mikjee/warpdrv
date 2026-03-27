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

// Re-export from hub-types
export { EDownloadStatus } from './hub-types';

// Chat message roles
export enum EChatRole {
	SYSTEM = 'system',
	USER = 'user',
	ASSISTANT = 'assistant',
}
