import type { JSONContent } from "@tiptap/react";

export interface IExtractedSlashCommand {
	name: string;
	params: Record<string, string>;
}

// Extract slash commands from tiptap JSON
export const extractCommands = (doc: JSONContent | undefined): IExtractedSlashCommand[] => {
	if (!doc) return [];
	const commands: IExtractedSlashCommand[] = [];
	const walk = (node: JSONContent) => {
		if (!node.content) return;
		for (const child of node.content) {
			if (child.type === "slashCommand") {
				const name = (child.attrs?.name as string) ?? "";
				let params: Record<string, string> = {};
				try {
					params = JSON.parse((child.attrs?.args as string) || "{}") as Record<string, string>;
				} catch {
					params = {};
				}
				commands.push({ name, params });
			} else if (child.content) {
				walk(child);
			}
		}
	};
	const content = doc.content ?? [];
	for (const node of content) walk(node);
	return commands;
};

// walks the tiptap doc -> plain string for assistant-ui composer
// slashCommand nodes are stripped — they live in message state, not text
export const docToString = (doc: JSONContent | undefined): string => {
	if (!doc) return "";
	const lines: Array<string> = [];
	const walkBlock = (node: JSONContent): string => {
		if (!node.content) return "";
		let out = "";
		for (const child of node.content) {
			if (child.type === "text") {
				out += child.text ?? "";
			}
			// slashCommand nodes are skipped — stored in message state, not text
		}
		return out;
	};
	const content = doc.content ?? [];
	for (const node of content) {
		if (node.type === "paragraph") {
			lines.push(walkBlock(node));
		} else {
			lines.push(walkBlock(node));
		}
	}
	return lines.join("\n");
};