// ============================================================
// warpbridge/src/validation/index.ts
// Validates tool call arguments against JSON Schema using ajv.
// Universal — works in Node and browser.
// ============================================================

import Ajv from 'ajv';

const ajv = new Ajv({ allErrors: true, strict: false });

export interface IValidationResult {
	valid: boolean;
	errors: string[];
}

// Validate tool arguments against the tool's JSON Schema.
export function validateToolArgs(schema: Record<string, unknown>, args: Record<string, unknown>): IValidationResult {
	try {
		const validate = ajv.compile(schema);
		const valid = validate(args);
		if (valid) return { valid: true, errors: [] };
		const errors = (validate.errors ?? []).map(e => {
			const path = e.instancePath || '/';
			return `${path}: ${e.message}`;
		});
		return { valid: false, errors };
	} catch (err) {
		return { valid: false, errors: [err instanceof Error ? err.message : String(err)] };
	}
}

// Sanitize a file path argument — reject directory traversal.
export function isSafePath(filePath: string): boolean {
	const normalized = filePath.replace(/\\/g, '/');
	if (normalized.includes('..')) return false;
	if (normalized.startsWith('/etc/') || normalized.startsWith('/proc/') || normalized.startsWith('/sys/')) return false;
	if (normalized.includes('.ssh') || normalized.includes('.gnupg')) return false;
	return true;
}

// Clean a JSON Schema from MCP for use in OpenAI tool definitions.
// Removes fields that confuse some providers.
export function cleanSchema(schema: Record<string, unknown>): Record<string, unknown> {
	const clean = { ...schema };
	delete clean['$schema'];
	return clean;
}
