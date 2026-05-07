export function extractResultText(result: unknown): string | null {
	if (!result) return null;
	let parsed: unknown = result;
	if (typeof result === 'string') {
		try { parsed = JSON.parse(result); } catch { return result; }
	}
	if (Array.isArray(parsed)) {
		const texts = parsed
			.filter(b => b && typeof b === 'object' && 'type' in b && b.type === 'text')
			.map(b => (b as { text: string }).text);
		return texts.length ? texts.join('\n') : null;
	}
	if (typeof parsed === 'object' && parsed !== null && 'content' in parsed) {
		return extractResultText((parsed as { content: unknown }).content);
	}
	return typeof parsed === 'string' ? parsed : JSON.stringify(parsed);
}