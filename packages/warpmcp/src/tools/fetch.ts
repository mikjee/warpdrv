export const fetchDefinition = {
	name: 'fetch',
	description: 'Perform an HTTP request and return the response.',
	inputSchema: {
		type: 'object',
		properties: {
			url: { type: 'string' },
			method: { type: 'string', default: 'GET' },
			headers: { type: 'object', additionalProperties: { type: 'string' } },
			body: { type: 'string' },
		},
		required: ['url'],
	},
	resultLimit: 200000,
};
export async function fetchHandler(args: { url: string; method?: string; headers?: Record<string, string>; body?: string }): Promise<{ status: number; headers: Record<string, string>; body: string }> {
	const res = await fetch(args.url, {
		method: args.method ?? 'GET',
		headers: args.headers,
		body: args.body,
	});
	const headers: Record<string, string> = {};
	res.headers.forEach((v, k) => { headers[k] = v; });
	const body = await res.text();
	return { status: res.status, headers, body };
}
