interface IElicitationResponse {
	action: 'accept' | 'decline' | 'cancel';
	content?: Record<string, unknown>;
}

export async function respondToElicitation(id: string, response: IElicitationResponse): Promise<void> {
	const res = await fetch(`/api/mcp/elicitation/${id}/respond`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(response),
	});
	if (!res.ok) throw new Error(`Failed to respond: ${res.status}`);
}
