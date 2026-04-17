import { spawn, spawnSync, type ChildProcess } from 'child_process';
import { randomUUID } from 'crypto';
import {
	ERecipeStepStatus,
	ERecipeRunStatus,
	ERecipeStreamKind,
	type IRecipeParsed,
	type IRecipeRunState,
	type IRecipeStepState,
	type TRecipeInputValues,
	type TRunId,
	type TRecipeId,
	type TStepId,
} from '@warpcore/shared';

interface ISSEEmitter {
	emit(channel: string, data: unknown): void;
}

interface IActiveRun {
	state: IRecipeRunState;
	proc: ChildProcess | null;
	cancelled: boolean;
}

let activeRun: IActiveRun | null = null;
let sseEmitter: ISSEEmitter | null = null;

export function setRecipeRunnerSSE(emitter: ISSEEmitter): void {
	sseEmitter = emitter;
}

export function isRunInProgress(): boolean {
	return activeRun !== null;
}

export function getActiveRun(): IRecipeRunState | null {
	return activeRun ? activeRun.state : null;
}

export async function startRun(
	recipeId: TRecipeId,
	parsed: IRecipeParsed,
	inputs: TRecipeInputValues,
): Promise<TRunId> {
	if (activeRun !== null) throw new Error('A recipe run is already in progress');
	if (sseEmitter === null) throw new Error('Recipe runner SSE emitter not initialized');

	const runId = randomUUID();
	const startedAt = Date.now();

	const stepStates: IRecipeStepState[] = parsed.steps.map(s => ({
		id: s.id,
		name: s.name,
		status: ERecipeStepStatus.PENDING,
	}));

	const state: IRecipeRunState = {
		runId,
		recipeId,
		status: ERecipeRunStatus.RUNNING,
		inputs,
		steps: stepStates,
		startedAt,
	};

	activeRun = { state, proc: null, cancelled: false };

	sseEmitter.emit('runs:started', state);

	void executeRun(parsed).catch(err => {
		console.error('[recipeRunner] unhandled error in executeRun:', err);
	});

	return runId;
}

export function cancelRun(): boolean {
	if (activeRun === null) return false;
	activeRun.cancelled = true;
	if (activeRun.proc !== null) {
		try {
			const proc = activeRun.proc;
			const pid = proc.pid;
			activeRun.proc = null;
			if (pid !== undefined && process.platform !== 'win32') {
				process.kill(-pid, 'SIGKILL');
			} else if (pid !== undefined) {
				spawnSync('taskkill', ['/T', '/F', '/PID', String(pid)], { stdio: 'ignore' });
			}
		}
		catch (err) { console.error('[recipeRunner] failed to kill:', err); }
	}
	return true;
}

async function executeRun(parsed: IRecipeParsed): Promise<void> {
	if (activeRun === null || sseEmitter === null) return;

	const env: Record<string, string> = sanitizeEnv(process.env);
	const controlPort = process.env.CONTROL_API_PORT;
	if (controlPort !== undefined) env.CONTROL_API_PORT = controlPort;

	for (const [name, value] of Object.entries(activeRun.state.inputs)) {
		env[name] = String(value);
	}

	let runStatus: ERecipeRunStatus = ERecipeRunStatus.OK;

	for (let i = 0; i < parsed.steps.length; i++) {
		if (activeRun === null) return;
		if (activeRun.cancelled) { runStatus = ERecipeRunStatus.CANCELLED; break; }

		const stepDef = parsed.steps[i]!;
		const stepState = activeRun.state.steps[i]!;
		const startedAt = Date.now();

		stepState.status = ERecipeStepStatus.RUNNING;
		stepState.startedAt = startedAt;

		sseEmitter.emit('runs:step-started', {
			runId: activeRun.state.runId,
			stepId: stepDef.id,
			startedAt,
		});

		const result = await runStep(stepDef.body, stepDef.cwd, env, stepDef.id, activeRun.state.runId);

		const finishedAt = Date.now();
		stepState.finishedAt = finishedAt;
		stepState.exitCode = result.exitCode;

		let stepFinalStatus: ERecipeStepStatus;
		if (result.cancelled) stepFinalStatus = ERecipeStepStatus.CANCELLED;
		else if (result.exitCode === 0) stepFinalStatus = ERecipeStepStatus.OK;
		else stepFinalStatus = ERecipeStepStatus.FAILED;

		stepState.status = stepFinalStatus;

		sseEmitter.emit('runs:step-finished', {
			runId: activeRun.state.runId,
			stepId: stepDef.id,
			status: stepFinalStatus,
			exitCode: result.exitCode,
			finishedAt,
		});

		if (stepFinalStatus === ERecipeStepStatus.CANCELLED) { runStatus = ERecipeRunStatus.CANCELLED; break; }
		if (stepFinalStatus === ERecipeStepStatus.FAILED) { runStatus = ERecipeRunStatus.FAILED; break; }
	}

	if (activeRun === null) return;

	const finishedAt = Date.now();
	activeRun.state.status = runStatus;
	activeRun.state.finishedAt = finishedAt;

	sseEmitter.emit('runs:finished', {
		runId: activeRun.state.runId,
		status: runStatus,
		finishedAt,
	});

	activeRun = null;
}

interface IStepResult {
	exitCode: number;
	cancelled: boolean;
}

function runStep(
	body: string,
	cwd: string | undefined,
	env: Record<string, string>,
	stepId: TStepId,
	runId: TRunId,
): Promise<IStepResult> {
	return new Promise<IStepResult>((resolve) => {
		const proc = spawn('bash', ['-c', body], {
			cwd: cwd ?? process.cwd(),
			env,
			stdio: ['ignore', 'pipe', 'pipe'],
			detached: true,
		});

		if (activeRun !== null) activeRun.proc = proc;

		proc.stdout?.on('data', (chunk: Buffer) => {
			sseEmitter?.emit('runs:step-output', {
				runId,
				stepId,
				kind: ERecipeStreamKind.STDOUT,
				data: chunk.toString('utf8'),
			});
		});

		proc.stderr?.on('data', (chunk: Buffer) => {
			sseEmitter?.emit('runs:step-output', {
				runId,
				stepId,
				kind: ERecipeStreamKind.STDERR,
				data: chunk.toString('utf8'),
			});
		});

		proc.on('error', (err) => {
			sseEmitter?.emit('runs:step-output', {
				runId,
				stepId,
				kind: ERecipeStreamKind.STDERR,
				data: `[runner] failed to spawn: ${err.message}\n`,
			});
			resolve({ exitCode: 1, cancelled: false });
		});

		proc.on('exit', (code, signal) => {
			if (activeRun !== null) activeRun.proc = null;
			const cancelled = activeRun !== null && activeRun.cancelled;
			const exitCode = code !== null ? code : (signal !== null ? 1 : 1);
			resolve({ exitCode, cancelled });
		});
	});
}

function sanitizeEnv(env: NodeJS.ProcessEnv): Record<string, string> {
	const out: Record<string, string> = {};
	for (const [k, v] of Object.entries(env)) {
		if (v !== undefined) out[k] = v;
	}
	return out;
}
