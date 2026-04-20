// ============================================================
// Model Inference Parser - Extract recommended params from README
// ============================================================

import { INFER_PARAM_TO_TYPE } from '@warpcore/bridge/inferParamNames';
import type { IChatInferenceParams } from '@warpcore/shared';

// Regex patterns for parsing inference params from README
const PATTERNS = {
	// YAML code block with inference_params or recommended_params
	yamlBlock: /```yaml\s*inference_params:\s*([\s\S]*?)(?=```|$)/i,
	yamlBlockAlt: /```yaml\s*recommended_params:\s*([\s\S]*?)(?=```|$)/i,
	
	// Key-value pairs in YAML format (indented)
	yamlKeyValue: /^[\s]+(\w+):[\s]+([^\n]+)/gm,
	
	// Markdown table with parameter names
	markdownTable: /[\|]\s*(\w[\s\w]*)\s*[\|]\s*([^\|]+)[\|]/g,
	
	// Bullet list with parameter names
	bulletList: /[-*]\s*(\w[\s\w]*):?\s*([^\n]+)/gi,
	
	// Key-value in text (e.g., "temperature = 0.7" or "temperature: 0.7")
	keyValue: /(\w[\w_]*)[\s]*[=:] [\s]*([^\s,]+)/gi,
	
	// Named sections for inference params
	namedSection: /##\s*(inference|parameters|recommended settings|usage)[\s\S]*?```?/i,
};

// Map common param name variations to our internal names
const PARAM_NAME_MAP: Record<string, string> = {
	// Temperature
	temp: 'temperature',
	temperature: 'temperature',
	
	// Top P
	top_p: 'topP',
	topp: 'topP',
	'top p': 'topP',
	
	// Top K
	top_k: 'topK',
	topk: 'topK',
	'top k': 'topK',
	
	// Min P
	min_p: 'minP',
	minp: 'minP',
	'min p': 'minP',
	
	// Repeat penalty
	repeat_penalty: 'repeatPenalty',
	repeatpenalty: 'repeatPenalty',
	'repeat penalty': 'repeatPenalty',
	
	// Frequency penalty
	frequency_penalty: 'frequencyPenalty',
	frequencypenalty: 'frequencyPenalty',
	'frequency penalty': 'frequencyPenalty',
	
	// Presence penalty
	presence_penalty: 'presencePenalty',
	presencepenalty: 'presencePenalty',
	'presence penalty': 'presencePenalty',
	
	// Max tokens
	max_tokens: 'maxTokens',
	maxtokens: 'maxTokens',
	'max tokens': 'maxTokens',
	max_length: 'maxTokens',
	maxlength: 'maxTokens',
	
	// Typical P
	typical_p: 'typicalP',
	typicalp: 'typicalP',
	'typical p': 'typicalP',
	
	// Mirostat
	mirostat: 'mirostatMode',
	mirostat_tau: 'mirostatTau',
	mirostat_eta: 'mirostatEta',
	
	// Dry
	dry_multiplier: 'dryMultiplier',
	drybase: 'dryBase',
	dry_allowed_length: 'dryAllowedLength',
	dry_penalty_last_n: 'dryPenaltyLastN',
	
	// Repeat last N
	repeat_last_n: 'repeatLastN',
	repeatlastn: 'repeatLastN',
};

/**
 * Normalize a parameter name to our internal camelCase format
 */
function normalizeParamName(name: string): string | null {
	const lowerName = name.toLowerCase().trim();
	const mappedName = PARAM_NAME_MAP[lowerName];
	
	// If mapped, use mapped name
	if (mappedName) {
		return mappedName;
	}
	
	// Try to convert snake_case to camelCase
	const camelName = lowerName.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
	
	// Check if it matches a known param via INFER_PARAM_TO_TYPE
	for (const [snake, camel] of Object.entries(INFER_PARAM_TO_TYPE) as [string, string][]) {
		if (snake === camelName || lowerName === camel.toLowerCase()) {
			return camel;
		}
	}
	
	return null;
}

/**
 * Parse a value string into appropriate type (number or string)
 */
function parseValue(value: string): number | string | boolean {
	// Trim quotes
	value = value.replace(/^["']|["']$/g, '');
	
	// Boolean
	if (value.toLowerCase() === 'true') return true;
	if (value.toLowerCase() === 'false') return false;
	
	// Number
	const num = parseFloat(value);
	if (!isNaN(num)) return num;
	
	// String
	return value;
}

/**
 * Extract params from YAML block content
 */
function parseYamlBlock(content: string): Partial<IChatInferenceParams> {
	const params: Partial<IChatInferenceParams> = {};
	
	let match;
	while ((match = PATTERNS.yamlKeyValue.exec(content)) !== null) {
		const rawName = match[1] ?? '';
		const value = match[2] ?? '';
		
		const paramName = normalizeParamName(rawName);
		if (paramName) {
			params[paramName] = parseValue(value);
		}
	}
	
	return params;
}

/**
 * Extract params from markdown table
 */
function parseMarkdownTable(content: string): Partial<IChatInferenceParams> {
	const params: Partial<IChatInferenceParams> = {};
	
	let match;
	while ((match = PATTERNS.markdownTable.exec(content)) !== null) {
		const paramName = (match[1] ?? '').trim();
		const value = (match[2] ?? '').trim();
		
		// Skip header rows
		if (paramName.toLowerCase() === 'parameter' || paramName.toLowerCase() === 'value') continue;
		
		const normalized = normalizeParamName(paramName);
		if (normalized) {
			params[normalized] = parseValue(value);
		}
	}
	
	return params;
}

/**
 * Extract params from bullet list
 */
function parseBulletList(content: string): Partial<IChatInferenceParams> {
	const params: Partial<IChatInferenceParams> = {};
	
	let match;
	while ((match = PATTERNS.bulletList.exec(content)) !== null) {
		const paramName = (match[1] ?? '').trim();
		const value = (match[2] ?? '').trim();
		
		const normalized = normalizeParamName(paramName);
		if (normalized) {
			params[normalized] = parseValue(value);
		}
	}
	
	return params;
}

/**
 * Extract params from key-value pairs in text
 */
function parseKeyValue(content: string): Partial<IChatInferenceParams> {
	const params: Partial<IChatInferenceParams> = {};
	
	let match;
	while ((match = PATTERNS.keyValue.exec(content)) !== null) {
		const paramName = (match[1] ?? '').trim();
		const value = (match[2] ?? '').trim();
		
		const normalized = normalizeParamName(paramName);
		if (normalized) {
			params[normalized] = parseValue(value);
		}
	}
	
	return params;
}

/**
 * Parse recommended inference params from README markdown
 * Uses multiple strategies in order of reliability
 */
export function parseRecommendedParamsFromReadme(readme: string): Partial<IChatInferenceParams> {
	const params: Partial<IChatInferenceParams> = {};
	let source: string | null = null;
	
	// Strategy 1: YAML code block (most reliable)
	const yamlMatch = readme.match(PATTERNS.yamlBlock) || readme.match(PATTERNS.yamlBlockAlt);
	if (yamlMatch) {
		const yamlParams = parseYamlBlock(yamlMatch[1] ?? '');
		if (Object.keys(yamlParams).length > 0) {
			Object.assign(params, yamlParams);
			source = 'yaml_block';
		}
	}
	
	// Strategy 2: Markdown table
	if (!source) {
		const tableParams = parseMarkdownTable(readme);
		if (Object.keys(tableParams).length > 0) {
			Object.assign(params, tableParams);
			source = 'markdown_table';
		}
	}
	
	// Strategy 3: Bullet list
	if (!source) {
		const bulletParams = parseBulletList(readme);
		if (Object.keys(bulletParams).length > 0) {
			Object.assign(params, bulletParams);
			source = 'bullet_list';
		}
	}
	
	// Strategy 4: Key-value pairs in text
	if (!source) {
		const kvParams = parseKeyValue(readme);
		if (Object.keys(kvParams).length > 0) {
			Object.assign(params, kvParams);
			source = 'key_value';
		}
	}
	
	// Log for debugging
	if (Object.keys(params).length > 0) {
		console.log('[ModelInferenceParser] Parsed params:', {
			params,
			source,
		});
	}
	
	return params;
}

/**
 * Fetch README from HuggingFace and parse recommended params
 */
export async function fetchAndParseModelRecommendations(hfUrl: string): Promise<Partial<IChatInferenceParams> | null> {
	try {
		// Extract author and model name from URL
		// Expected format: https://huggingface.co/author/model-name or author/model-name
		let author: string;
		let modelName: string;
		
		if (hfUrl.includes('huggingface.co')) {
			const url = new URL(hfUrl);
			const parts = url.pathname.split('/').filter(p => p.trim());
			author = parts[0] || '';
			modelName = parts[1] || '';
		} else {
			// Assume format: author/model-name
			const parts = hfUrl.split('/');
			author = parts[0] || '';
			modelName = parts[1] || '';
		}
		
		if (!author || !modelName) {
			console.warn('[ModelInferenceParser] Invalid HF URL:', hfUrl);
			return null;
		}
		
		// Fetch README from HF API
		const readmeUrl = `https://huggingface.co/${author}/${modelName}/resolve/main/README.md`;
		const response = await fetch(readmeUrl);
		
		if (!response.ok) {
			console.log('[ModelInferenceParser] Failed to fetch README:', readmeUrl, response.status);
			return null;
		}
		
		const readme = await response.text();
		const params = parseRecommendedParamsFromReadme(readme);
		
		console.log('[ModelInferenceParser] Fetched and parsed params for', hfUrl, ':', params);
		
		return Object.keys(params).length > 0 ? params : null;
	} catch (err) {
		console.warn('[ModelInferenceParser] Error fetching/parsing:', err);
		return null;
	}
}
