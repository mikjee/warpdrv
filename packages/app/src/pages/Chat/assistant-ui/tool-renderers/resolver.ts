import type { IToolCallRenderer } from '@/store/types';
import type React from 'react';

export interface IResolvedRenderer {
	component: React.ComponentType<any>;
	props: Record<string, unknown>;
}

// Splits a tool name into lowercase tokens.
// "edit_file" -> ["edit","file"]
// "strReplaceEditor" -> ["str","replace","editor"]
// "search-files.v2" -> ["search","files","v2"]
export function tokenizeToolName(name: string): string[] {
	return name
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		.split(/[\s_\-.:]+/)
		.map(t => t.toLowerCase())
		.filter(t => t.length > 0);
}

// Returns names of renderers whose keywords overlap with the tool name tokens.
// Order = registration order (Object.keys order on registry).
function findCandidates(toolName: string, registry: Record<string, IToolCallRenderer>): string[] {
	const tokens = new Set(tokenizeToolName(toolName));
	const matches: string[] = [];
	for (const [name, entry] of Object.entries(registry)) {
		for (const kw of entry.keywords) {
			if (tokens.has(kw.toLowerCase())) {
				matches.push(name);
				break;
			}
		}
	}
	return matches;
}

// Auto-resolves a renderer for a tool call by name+args.
// Returns null if no candidate renderer accepts the args.
export function autoResolveRenderer(
	toolName: string,
	args: Record<string, unknown>,
	registry: Record<string, IToolCallRenderer>,
): IResolvedRenderer | null {
	// Priority 1: keyword exactly equals toolName
	for (const [name, entry] of Object.entries(registry)) {
		if (entry.keywords.includes(toolName)) {
			const result = entry.canRender(args);
			if (result !== false) {
				return { component: entry.component, props: result };
			}
		}
	}
	// Priority 2: tokenized keyword match
	const candidates = findCandidates(toolName, registry);
	for (const name of candidates) {
		const entry = registry[name];
		const result = entry.canRender(args);
		if (result !== false) {
			return { component: entry.component, props: result };
		}
	}
	return null;
}
