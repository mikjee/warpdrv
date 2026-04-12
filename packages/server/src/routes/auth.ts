import { Router } from 'express';
import { store } from '../util/store';
import { validateBearerToken } from './tokens';
import type { IAccessToken, IAccessTokenInfo, ISettings } from '@warpcore/shared';
import { isRemote } from '../middleware/auth';
import { DEFAULT_SETTINGS } from '@warpcore/shared';

const SETTINGS_KEY = 'settings:general';

async function getSettings(): Promise<ISettings> {
	return (await store.get<ISettings>(SETTINGS_KEY)) ?? DEFAULT_SETTINGS;
}

export const authRouter = Router();

const COOKIE_NAME = 'warpcore_auth';

// Helper to strip tokenHash
function toInfo(token: IAccessToken): IAccessTokenInfo {
	return {
		id: token.id,
		name: token.name,
		tokenPrefix: token.tokenPrefix,
		admin: token.admin,
		inference: token.inference,
		mcp_labelled: token.mcp_labelled,
		mcp_inline: token.mcp_inline,
		createdAt: token.createdAt,
	};
}

// POST /api/auth/login - validate token, set cookie
authRouter.post('/login', async (req, res) => {
	const authHeader = req.headers.authorization;
	const token = await validateBearerToken(authHeader);

	if (!token) {
		res.status(401).json({ ok: false, data: null, error: 'Invalid token' });
		return;
	}

	// Set HttpOnly cookie with token ID
	const isSecure = process.env.NODE_ENV === 'production';
	res.cookie(COOKIE_NAME, token.id, {
		httpOnly: true,
		secure: isSecure,
		sameSite: 'strict' as const,
		maxAge: undefined, // no expiry
	});

	res.json({
		ok: true,
		data: toInfo(token),
		error: null,
	});
});

// GET /api/auth/check - check auth status
authRouter.get('/check', async (req, res) => {
	// Check if auth is actually required
	const settings = await getSettings();
	const authRequired = isRemote(req) && settings.apiAuthEnabled;

	// If auth not required, always return authenticated
	if (!authRequired) {
		res.json({ ok: true, data: { authenticated: true }, error: null });
		return;
	}

	const tokenId = req.cookies?.[COOKIE_NAME];

	if (!tokenId) {
		res.json({ ok: true, data: null, error: null });
		return;
	}

	// Look up token by ID
	const tokens = await store.list<IAccessToken>('tokens:');
	const token = tokens.find(t => t.id === tokenId);

	if (!token) {
		// Cookie exists but token doesn't, clear it
		res.clearCookie(COOKIE_NAME);
		res.json({ ok: true, data: null, error: null });
		return;
	}

	res.json({
		ok: true,
		data: toInfo(token),
		error: null,
	});
});

// GET /api/auth/me - get current token info
authRouter.get('/me', async (req, res) => {
	const tokenId = req.cookies?.[COOKIE_NAME];

	if (!tokenId) {
		res.status(401).json({ ok: false, data: null, error: 'Not authenticated' });
		return;
	}

	// Look up token by ID
	const tokens = await store.list<IAccessToken>('tokens:');
	const token = tokens.find(t => t.id === tokenId);

	if (!token) {
		res.clearCookie(COOKIE_NAME);
		res.status(401).json({ ok: false, data: null, error: 'Token not found' });
		return;
	}

	res.json({
		ok: true,
		data: toInfo(token),
		error: null,
	});
});

// POST /api/auth/logout - clear cookie
authRouter.post('/logout', (_req, res) => {
	res.clearCookie(COOKIE_NAME);
	res.json({ ok: true, data: null, error: null });
});
