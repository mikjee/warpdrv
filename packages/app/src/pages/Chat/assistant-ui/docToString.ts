import type { JSONContent } from "@tiptap/react";

// walks the tiptap doc -> plain string for assistant-ui composer
// this is the single point where command serialization/filtering will live later
export const docToString = (doc: JSONContent | undefined): string => {
	if (!doc) return "";
	const lines: Array<string> = [];
	const walkBlock = (node: JSONContent): string => {
		if (!node.content) return "";
		let out = "";
		for (const child of node.content) {
			if (child.type === "text") {
				out += child.text ?? "";
			} else if (child.type === "slashCommand") {
				// parked: hardcoded passthrough as literal text
				const name = (child.attrs?.name as string) ?? "";
				out += `/${name}`;
			}
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