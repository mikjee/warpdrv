export const INFER_PARAM_TO_API: Record<string, string> = {
	temperature: 'temperature',
	topP: 'top_p',
	topK: 'top_k',
	minP: 'min_p',
	repeatPenalty: 'repeat_penalty',
	frequencyPenalty: 'frequency_penalty',
	presencePenalty: 'presence_penalty',
	maxTokens: 'max_tokens',
	stopSequences: 'stop',
	seed: 'seed',
	responseFormat: 'response_format',
	reasoningFormat: 'reasoning_format',
	enableThinking: 'enable_thinking',
	reasoningEffort: 'reasoning_effort',
	mirostatMode: 'mirostat',
	mirostatTau: 'mirostat_tau',
	mirostatEta: 'mirostat_eta',
	cachePrompt: 'cache_prompt',
	typicalP: 'typical_p',
	ignoreEos: 'ignore_eos',
	dryMultiplier: 'dry_multiplier',
	dryBase: 'dry_base',
	dryAllowedLength: 'dry_allowed_length',
	dryPenaltyLastN: 'dry_penalty_last_n',
	topNSigma: 'top_n_sigma',
	xtcProbability: 'xtc_probability',
	xtcThreshold: 'xtc_threshold',
	dynatempRange: 'dynatemp_range',
	dynatempExponent: 'dynatemp_exponent',
	repeatLastN: 'repeat_last_n',
	n_probs: 'n_probs',
	samplers: 'samplers',
	grammar: 'grammar',
	adaptiveTarget: 'adaptive_target',
	adaptiveDecay: 'adaptive_decay',
	jsonSchema: 'json_schema',
};

export const INFER_PARAM_TO_TYPE: Record<string, string> = {
	temperature: 'temperature',
	top_p: 'topP',
	top_k: 'topK',
	min_p: 'minP',
	repeat_penalty: 'repeatPenalty',
	frequency_penalty: 'frequencyPenalty',
	presence_penalty: 'presencePenalty',
	max_tokens: 'maxTokens',
	stop: 'stopSequences',
	seed: 'seed',
	response_format: 'responseFormat',
	reasoning_format: 'reasoningFormat',
	enable_thinking: 'enableThinking',
	reasoning_effort: 'reasoningEffort',
	mirostat: 'mirostatMode',
	mirostat_tau: 'mirostatTau',
	mirostat_eta: 'mirostatEta',
	cache_prompt: 'cachePrompt',
	typical_p: 'typicalP',
	ignore_eos: 'ignoreEos',
	dry_multiplier: 'dryMultiplier',
	dry_base: 'dryBase',
	dry_allowed_length: 'dryAllowedLength',
	dry_penalty_last_n: 'dryPenaltyLastN',
	top_n_sigma: 'topNSigma',
	xtc_probability: 'xtcProbability',
	xtc_threshold: 'xtcThreshold',
	dynatemp_range: 'dynatempRange',
	dynatemp_exponent: 'dynatempExponent',
	repeat_last_n: 'repeatLastN',
	n_probs: 'n_probs',
	samplers: 'samplers',
	grammar: 'grammar',
	adaptive_target: 'adaptiveTarget',
	adaptive_decay: 'adaptiveDecay',
	json_schema: 'jsonSchema',
};

export function inferParamsToApiJson(params: Record<string, unknown>): string {
	const result: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(params)) {
		if (value === undefined) continue;
		const apiKey = INFER_PARAM_TO_API[key] ?? key;
		result[apiKey] = value;
	}
	return JSON.stringify(result, null, 2);
}

export function inferParamsFromApiJson(jsonStr: string): Record<string, unknown> {
	const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
	const result: Record<string, unknown> = {};
	for (const [apiKey, value] of Object.entries(parsed)) {
		result[INFER_PARAM_TO_TYPE[apiKey] ?? apiKey] = value;
	}
	return result;
}
