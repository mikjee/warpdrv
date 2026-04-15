// Recipe Engine - shared types

// ============================================================
// Identifiers
// ============================================================

export type TRecipeId = string;
export type TRunId = string;
export type TStepId = string;
export type TInputName = string;

// ============================================================
// Enums
// ============================================================

export enum ERecipeInputType {
	STRING = "STRING",
	NUMBER = "NUMBER",
	BOOL = "BOOL",
	CHOICE = "CHOICE",
}

export enum ERecipeStepStatus {
	PENDING = "PENDING",
	RUNNING = "RUNNING",
	OK = "OK",
	FAILED = "FAILED",
	CANCELLED = "CANCELLED",
	SKIPPED = "SKIPPED",
}

export enum ERecipeRunStatus {
	RUNNING = "RUNNING",
	OK = "OK",
	FAILED = "FAILED",
	CANCELLED = "CANCELLED",
}

export enum ERecipeStreamKind {
	STDOUT = "STDOUT",
	STDERR = "STDERR",
}

// ============================================================
// Recipe definition (parsed from bash source)
// ============================================================

export interface IRecipeInputDef {
	name: TInputName;
	type: ERecipeInputType;
	defaultValue?: string | number | boolean;
	options?: string[];
	description?: string;
}

export interface IRecipeStepDef {
	id: TStepId;
	name: string;
	cwd?: string;
	body: string;
}

export interface IRecipeParsed {
	inputs: IRecipeInputDef[];
	steps: IRecipeStepDef[];
}

// ============================================================
// Recipe (stored)
// ============================================================

export interface IRecipe {
	id: TRecipeId;
	name: string;
	description: string;
	source: string;
	isBuiltIn: boolean;
	createdAt: number;
	updatedAt: number;
}

export interface IRecipeCreatePayload {
	name: string;
	description: string;
	source: string;
}

export interface IRecipeUpdatePayload {
	name?: string;
	description?: string;
	source?: string;
}

// ============================================================
// Recipe state (per-recipe persisted UI state)
// ============================================================

export type TRecipeInputValues = Record<TInputName, string | number | boolean>;

export interface IRecipeState {
	recipeId: TRecipeId;
	lastInputs: TRecipeInputValues;
	lastRunAt?: number;
	lastRunStatus?: ERecipeRunStatus;
}

// ============================================================
// Run state (live, in-memory)
// ============================================================

export interface IRecipeStepState {
	id: TStepId;
	name: string;
	status: ERecipeStepStatus;
	startedAt?: number;
	finishedAt?: number;
	exitCode?: number;
}

export interface IRecipeRunState {
	runId: TRunId;
	recipeId: TRecipeId;
	status: ERecipeRunStatus;
	inputs: TRecipeInputValues;
	steps: IRecipeStepState[];
	startedAt: number;
	finishedAt?: number;
}

// ============================================================
// SSE channel payloads (one interface per channel)
// ============================================================

export interface IRecipesInitPayload {
	recipes: Record<TRecipeId, IRecipe>;
	activeRun: IRecipeRunState | null;
}

export interface IRunsStepStartedPayload {
	runId: TRunId;
	stepId: TStepId;
	startedAt: number;
}

export interface IRunsStepOutputPayload {
	runId: TRunId;
	stepId: TStepId;
	kind: ERecipeStreamKind;
	data: string;
}

export interface IRunsStepFinishedPayload {
	runId: TRunId;
	stepId: TStepId;
	status: ERecipeStepStatus;
	exitCode?: number;
	finishedAt: number;
}

export interface IRunsFinishedPayload {
	runId: TRunId;
	status: ERecipeRunStatus;
	finishedAt: number;
}

// ============================================================
// API request/response shapes
// ============================================================

export interface IRecipeRunRequest {
	inputs: TRecipeInputValues;
}

export interface IRecipeRunResponse {
	runId: TRunId;
}
