import type { Request } from 'express';
import type { IWarpmcpDeps } from './types';
export async function authorizeToolCall(deps: IWarpmcpDeps, req: Request, toolName: string): Promise<{ ok: boolean; reason?: string }> {
	if (!deps.isRemote(req as any)) {
		return { ok: true };
	}
	const token = await deps.validateBearerToken(req.headers.authorization);
	if (!token) {
		return { ok: false, reason: 'Missing or invalid Bearer token.' };
	}
	if (token.admin) {
		return { ok: true };
	}
	const scope = token.mcp_labelled;
	if (scope === true) {
		return { ok: true };
	}
	if (Array.isArray(scope) && scope.includes(toolName)) {
		return { ok: true };
	}
	return { ok: false, reason: `Token lacks mcp_labelled scope for tool: ${toolName}` };
}
export async function authorizeAccess(deps: IWarpmcpDeps, req: Request): Promise<{ ok: boolean; reason?: string }> {
	if (!deps.isRemote(req as any)) {
		return { ok: true };
	}
	const token = await deps.validateBearerToken(req.headers.authorization);
	if (!token) {
		return { ok: false, reason: 'Missing or invalid Bearer token.' };
	}
	if (token.admin) return { ok: true };
	if (token.mcp_labelled === true || (Array.isArray(token.mcp_labelled) && token.mcp_labelled.length > 0)) {
		return { ok: true };
	}
	return { ok: false, reason: 'Token lacks mcp_labelled scope.' };
}
