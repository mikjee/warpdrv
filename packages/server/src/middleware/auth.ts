import { Response, NextFunction } from 'express';
import { store } from '../util/store';
import { validateBearerToken } from '../routes/tokens';
import type { IAccessToken, ISettings } from '@warpcore/shared';
import { DEFAULT_SETTINGS } from '@warpcore/shared';

const SETTINGS_KEY = 'settings:general';
const COOKIE_NAME = 'warpcore_auth';

// Check if request is from a remote host (not localhost)
export function isRemote(req: { ip: string; connection: { remoteAddress: string } }): boolean {
	const ip = req.ip || req.connection.remoteAddress || '';
	const normalized = ip.replace(/^::ffff:/, '');
	const isLocalhost = normalized === '::1' || normalized === '127.0.0.1';
	return !isLocalhost;
}

// Check if auth should be required for this request
export async function shouldRequireAuth(req: { ip: string; connection: { remoteAddress: string } }): Promise<boolean> {
	const settings = await getSettings();
	
	// If localhost auth is forced, always require auth
	if (settings.authRequireForLocalhost) return true;
	
	// Otherwise, only require auth for remote hosts
	return isRemote(req);
}

// Get current settings
async function getSettings(): Promise<ISettings> {
	return (await store.get<ISettings>(SETTINGS_KEY)) ?? DEFAULT_SETTINGS;
}

// Check if user has admin access via cookie or token
export async function hasAdminAccess(req: { cookies?: Record<string, string>; headers?: Record<string, string>; ip?: string; connection?: { remoteAddress: string } }): Promise<boolean> {
	const settings = await getSettings();

	// If not requiring auth (localhost and authRequireForLocalhost is false), allow
	if (!await shouldRequireAuth(req)) return true;

	// Check if any auth is enabled
	if (!settings.apiAuthEnabled && !settings.proxyAuthEnabled) return true;

	// Check cookie first
	if (req.cookies?.[COOKIE_NAME]) {
		const tokens = await store.list<IAccessToken>('tokens:');
		const token = tokens.find(t => t.id === req.cookies[COOKIE_NAME]);
		if (token?.admin) return true;
	}

	// Check Bearer token
	const token = await validateBearerToken(req.headers?.authorization);
	if (token?.admin) return true;

	return false;
}

// Auth middleware for /api/* routes
export async function authMiddleware(req: any, res: Response, next: NextFunction): Promise<void> {
	const settings = await getSettings();

	// Bypass auth if:
	// 1. authRequireForLocalhost is false AND request is from localhost
	// 2. apiAuthEnabled is false
	if (!await shouldRequireAuth(req) || !settings.apiAuthEnabled) {
		next();
		return;
	}

	// Check cookie auth
	if (req.cookies?.[COOKIE_NAME]) {
		const tokens = await store.list<IAccessToken>('tokens:');
		const token = tokens.find(t => t.id === req.cookies[COOKIE_NAME]);
		if (token) {
			next();
			return;
		}
	}

	// Check Bearer token
	const token = await validateBearerToken(req.headers?.authorization);
	if (token) {
		next();
		return;
	}

	res.status(401).json({ ok: false, data: null, error: 'Authentication required' });
}

// Auth middleware for /v1/* proxy routes
export async function proxyAuthMiddleware(req: any, res: Response, next: NextFunction): Promise<void> {
	const settings = await getSettings();

	// Bypass auth if:
	// 1. authRequireForLocalhost is false AND request is from localhost
	// 2. proxyAuthEnabled is false
	if (!await shouldRequireAuth(req) || !settings.proxyAuthEnabled) {
		next();
		return;
	}

	// Check Bearer token (proxy uses Bearer auth, not cookies)
	const token = await validateBearerToken(req.headers?.authorization);

	if (!token) {
		res.status(401).json({
			ok: false,
			data: null,
			error: 'Authentication required',
		});
		return;
	}

	// Check if token has inference access
	const model = req.body?.model;
	if (model && !hasInferenceAccessForToken(token, model)) {
		res.status(403).json({
			ok: false,
			data: null,
			error: 'Access denied for this model',
		});
		return;
	}

	// Attach token to request for downstream use
	(req as any).authToken = token;
	next();
}

// Check if token has inference access for a specific model alias
export function hasInferenceAccessForToken(token: IAccessToken, modelAlias: string): boolean {
	if (token.admin) return true;
	if (token.inference === true) return true;
	if (Array.isArray(token.inference)) return token.inference.includes(modelAlias);
	return false;
}

// Check if token has MCP access (labelled tools from mcp.json)
export function hasMcpLabelledAccessForToken(token: IAccessToken, toolName: string): boolean {
	if (token.admin) return true;
	if (token.mcp_labelled === true) return true;
	if (Array.isArray(token.mcp_labelled)) return token.mcp_labelled.includes(toolName);
	return false;
}

// Check if token has MCP access (inline/ephemeral tools)
export function hasMcpInlineAccessForToken(token: IAccessToken, toolName: string): boolean {
	if (token.admin) return true;
	if (token.mcp_inline === true) return true;
	if (Array.isArray(token.mcp_inline)) return token.mcp_inline.includes(toolName);
	return false;
}
