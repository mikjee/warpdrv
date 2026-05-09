// ============================================================
// Whisper Types - separate layer from llama
// ============================================================

import type { EValidationStatus } from './enums';

// ============================================================
// Identifiers
// ============================================================
export type TWhisperBackendId = string;
export type TWhisperServerId = string;

// ============================================================
// Whisper Backend
// ============================================================
export interface IWhisperBackend {
	id: TWhisperBackendId;
	name: string;
	path: string; // absolute path to whisper-server binary
	defaultArgs: string[];
	description: string;
	validation: EValidationStatus;
	version: string;
	createdAt: number;
	updatedAt: number;
}

export interface IWhisperBackendCreatePayload {
	name: string;
	path: string;
	defaultArgs: string[];
	description: string;
}

export interface IWhisperBackendUpdatePayload {
	name?: string;
	path?: string;
	defaultArgs?: string[];
	description?: string;
}

// ============================================================
// Whisper Launch Params
// ============================================================
export interface IWhisperLaunchParams {
	port: number;             // --port (0 = auto-assign)
	threads: number;          // -t, 0 = auto
	processors: number;       // -p, 0 = auto
	noGpu: boolean;           // --no-gpu (force CPU)
	flashAttn: boolean;       // --flash-attn
	language: string;         // -l, empty = auto-detect
	translate: boolean;       // --translate (output English)
	beamSize: number;         // -bs, 0 = default
	temperature: number;      // -tp, 0 = default
	prompt: string;           // --prompt, initial prompt tokens
	convert: boolean;         // --convert, auto-convert audio formats
	inferencePath: string;    // --inference-path, OpenAI endpoint path
	extraArgs: string;        // free-form additional flags
}

export const DEFAULT_WHISPER_LAUNCH_PARAMS: IWhisperLaunchParams = {
	port: 0,
	threads: 0,
	processors: 0,
	noGpu: false,
	flashAttn: false,
	language: '',
	translate: false,
	beamSize: 0,
	temperature: 0,
	prompt: '',
	convert: true,
	inferencePath: '/v1/audio/transcriptions',
	extraArgs: '',
};

// ============================================================
// Whisper Server Status
// ============================================================
export enum EWhisperServerStatus {
	STOPPED = 'STOPPED',
	LOADING = 'LOADING',
	RUNNING = 'RUNNING',
	ERROR = 'ERROR',
}

// ============================================================
// Whisper Server
// ============================================================
export interface IWhisperServer {
	id: TWhisperServerId;
	backendId: TWhisperBackendId | undefined;
	modelPath: string; // path to whisper model file (.gguf or .bin)
	serverName: string;
	serverAlias: string[];
	params: IWhisperLaunchParams;
	port: number;
	pid: number | undefined;
	status: EWhisperServerStatus;
	startedAt: number | null;
	error: string | null;
	autoLaunch: boolean;
	launchCommand: string | null;
}

export interface IWhisperServerCreatePayload {
	backendId: TWhisperBackendId | undefined;
	modelPath: string;
	serverName: string | null;
	params: IWhisperLaunchParams;
	serverAlias?: string[];
	autoLaunch?: boolean;
}

// ============================================================
// Whisper Model Metadata
// ============================================================
export interface IWhisperModelMetadata {
	architecture: string;
	languages: string[];
	vocabSize: number;
	encoderDim: number;
	contextLength: number;
	fileSize: number;
}

// ============================================================
// Whisper Model (scanned from disk)
// ============================================================
export interface IWhisperModelFile {
	fileName: string;
	filePath: string;
	sizeMb: number;
	format: 'gguf' | 'bin';
	metadata: IWhisperModelMetadata | null;
}

export interface IWhisperModel {
	id: string;
	user: string; // folder name (HF user)
	name: string; // folder name (HF model)
	dirPath: string;
	files: IWhisperModelFile[];
	primaryFile: IWhisperModelFile | null;
	totalSizeMb: number;
}
