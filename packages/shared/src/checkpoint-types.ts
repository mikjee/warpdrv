import type { TServerId } from './types';
import type { TThreadId, TMessageId } from '@warpcore/bridge';

export type TCheckpointId = string;
export type TBundleId = string;
export type TTaskId = number;
export type TSlotId = number;
export type TFingerprintHash = string;

export enum ECheckpointSaveMode {
	SAVE = 'SAVE',
	SAVE_AS = 'SAVE_AS',
}

export interface ICheckpointFingerprint {
	modelFilename: string;
	modelSizeBytes: number;
}

// One checkpoint = one slot saved to disk
export interface ICheckpoint {
	id: TCheckpointId;
	bundleId: TBundleId | null;
	name: string;
	serverId: TServerId;
	slotIndex: TSlotId;
	filename: string;
	fingerprint: ICheckpointFingerprint;
	fingerprintHash: TFingerprintHash;
	sizeBytes: number;
	tokens: number;
	messageCount: number | null;
	lastUserMessagePreview: string | null;
	isAutoSave: boolean;
	notes: string | null;
	createdAt: number;
}

export interface ICheckpointBinding {
	checkpointId: TCheckpointId;
	threadId: TThreadId;
	messageId: TMessageId;
}

export interface ISlotLiveState {
	slotId: TSlotId;
	isProcessing: boolean;
	taskId: TTaskId | null;
	promptTokens: number;
	generatedTokens: number;
	cachedTokens: number;
	prefillProgress: number | null;
	nCtx: number;
	lastActivityAt: number;
}

export interface ISlotLiveMetadata {
	slotId: TSlotId;
	messageCount: number;
	lastUserMessagePreview: string;
	updatedAt: number;
}

export interface IServerSlotsState {
	serverId: TServerId;
	slots: ISlotLiveState[];
	metadata: Record<TSlotId, ISlotLiveMetadata>;
}

export interface ISaveCheckpointRequest {
	serverId: TServerId;
	slotIds: TSlotId[] | null;
	mode: ECheckpointSaveMode;
	name: string | null;
	notes: string | null;
}

// Save returns one checkpoint per slot saved
export interface ISaveCheckpointResponse {
	bundleId: TBundleId | null;
	checkpoints: ICheckpoint[];
}

export interface IFingerprintMismatch {
	field: keyof ICheckpointFingerprint;
	expected: unknown;
	actual: unknown;
}

// Restore takes either single checkpoint id or bundle id
export interface IRestoreCheckpointRequest {
	checkpointId: TCheckpointId | null;
	bundleId: TBundleId | null;
	targetServerId: TServerId;
}

export interface ICheckpointSlotMapping {
	checkpointId: TCheckpointId;
	targetSlotId: TSlotId;
}

export interface IRestoreCheckpointsMappedRequest {
	targetServerId: TServerId;
	mappings: ICheckpointSlotMapping[];
}

export interface IRestoreCheckpointResponse {
	success: boolean;
	restoredSlotCount: number;
	fingerprintMismatches: IFingerprintMismatch[];
}

export interface IListCheckpointsQuery {
	serverId: TServerId | null;
	threadId: TThreadId | null;
}

export const SSE_CHANNELS_CHECKPOINT = {
	SLOT_STATE: 'slot:state',
	SLOT_METADATA: 'slot:metadata',
	SERVER_SLOTS_SNAPSHOT: 'server:slots-snapshot',
	CHECKPOINT_CREATED: 'checkpoint:created',
	CHECKPOINT_UPDATED: 'checkpoint:updated',
	CHECKPOINT_DELETED: 'checkpoint:deleted',
	CHECKPOINT_RESTORED: 'checkpoint:restored',
	CHECKPOINTS_INIT: 'checkpoints:init',
} as const;

export type TSseCheckpointChannel = typeof SSE_CHANNELS_CHECKPOINT[keyof typeof SSE_CHANNELS_CHECKPOINT];

export interface ISseSlotStatePayload {
	serverId: TServerId;
	state: ISlotLiveState;
}

export interface ISseSlotMetadataPayload {
	serverId: TServerId;
	metadata: ISlotLiveMetadata;
}

export interface ISseServerSlotsSnapshotPayload {
	snapshot: IServerSlotsState;
}

export interface ISseCheckpointPayload {
	checkpoint: ICheckpoint;
}

export interface ISseCheckpointDeletedPayload {
	checkpointId: TCheckpointId;
}

export interface ISseCheckpointRestoredPayload {
	targetServerId: TServerId;
	restoredSlotCount: number;
	bundleId: TBundleId | null;
}
