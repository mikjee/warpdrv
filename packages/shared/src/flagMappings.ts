// ============================================================
// Flag Mappings
// Maps internal param field names to their command-line flag representations
// ============================================================

export interface IFlagMapping {
	field: string;
	flag: string; // The flag that enables the feature (e.g., '--jinja', '-dio')
	negated?: boolean; // If true, the flag DISABLES the feature (e.g., '--no-mmap' means mmap=false)
	valueFlag?: boolean; // If true, this flag takes a numeric value (e.g., '-ngl 999')
}

// Toggle flags that appear in BackendDialog COMMON_FLAGS and LaunchParamsPanel
export const TOGGLE_FLAG_MAPPINGS: IFlagMapping[] = [
	{ field: 'flashAttn', flag: '-fa' },
	{ field: 'mlock', flag: '--mlock' },
	{ field: 'directIo', flag: '-dio' },
	{ field: 'noWarmup', flag: '--no-warmup' },
	{ field: 'jinja', flag: '--jinja' },
	{ field: 'mmap', flag: '--no-mmap', negated: true }, // --no-mmap DISABLES mmap, so absence means enabled by default
];

// Flags that take numeric values (flag followed by its value)
export const VALUE_FLAG_MAPPINGS: Record<string, string> = {
	gpuLayers: '-ngl',
	contextSize: '-c',
	batchSize: '-b',
	ubatchSize: '-ub',
	threads: '-t',
	threadsBatch: '-tb',
	flashAttn: '-fa',
};

// Common preset flags for quick-add in BackendDialog
export interface ICommonFlagPreset {
	field: string;
	flag: string;
	label: string;
}

export const COMMON_FLAG_PRESETS: ICommonFlagPreset[] = [
	{ field: 'gpuLayers', flag: '-ngl 999', label: 'Full GPU offload' },
];

function getToggleLabel(mapping: IFlagMapping): string {
	if (mapping.negated) {
		return `Disable ${mapping.field.replace(/([A-Z])/g, ' $1').toLowerCase()}`;
	}
	const labelMap: Record<string, string> = {
		flashAttn: 'Flash Attention',
		mlock: 'Lock memory',
		directIo: 'Direct I/O',
		noWarmup: 'Skip warmup',
		jinja: 'Jinja templates',
	};
	return labelMap[mapping.field] ?? mapping.field;
}

// Generate toggle presets from TOGGLE_FLAG_MAPPINGS (includes negated flags like --no-mmap)
const TOGGLE_PRESETS: ICommonFlagPreset[] = TOGGLE_FLAG_MAPPINGS.map(m => ({
	field: m.field,
	flag: m.flag,
	label: getToggleLabel(m),
}));

// Combine all presets in order
export const ALL_COMMON_FLAGS: ICommonFlagPreset[] = [
	...COMMON_FLAG_PRESETS,
	...TOGGLE_PRESETS,
];

// Get the mapping for a given field name
export function getFlagMapping(field: string): IFlagMapping | undefined {
	return TOGGLE_FLAG_MAPPINGS.find(m => m.field === field);
}

// Check if a flag is present in an args array
export function hasFlag(args: string[], flag: string): boolean {
	return args.includes(flag);
}

// Parse backend defaultArgs into param values
export function parseDefaultArgsToParams(defaultArgs: string[]): Record<string, boolean | undefined> {
	const argsSet = new Set(defaultArgs);
	const result: Record<string, boolean | undefined> = {};

	for (const mapping of TOGGLE_FLAG_MAPPINGS) {
		if (mapping.negated) {
			// For negated flags like --no-mmap: presence means false, absence means undefined
			result[mapping.field] = argsSet.has(mapping.flag) ? false : undefined;
		} else {
			// For positive flags: presence means true, absence means undefined
			result[mapping.field] = argsSet.has(mapping.flag) ? true : undefined;
		}
	}

	return result;
}

// Convert param values to flag array for backend defaultArgs
export function paramsToFlags(params: Record<string, boolean>): string[] {
	const flags: string[] = [];

	for (const mapping of TOGGLE_FLAG_MAPPINGS) {
		const value = params[mapping.field];
		if (value === undefined || value === null) continue;

		if (mapping.negated) {
			// For negated flags: only add flag if value is false
			if (!value) {
				flags.push(mapping.flag);
			}
		} else {
			// For positive flags: only add flag if value is true
			if (value) {
				flags.push(mapping.flag);
			}
		}
	}

	return flags;
}
