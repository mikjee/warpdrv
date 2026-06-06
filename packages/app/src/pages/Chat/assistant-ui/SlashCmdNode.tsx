import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import Suggestion from "@tiptap/suggestion";
import { commandSuggestion } from "./CmdSuggestion";

// hardcoded /test for now — command registry is parked
const SlashPill: React.FC<NodeViewProps> = (props) => {
	const name = props.node.attrs.name as string;
	return (
		<NodeViewWrapper className="inline">
			<span
				contentEditable={false}
				className="aui-slash-pill"
				style={{
					display: "inline-flex",
					alignItems: "center",
					borderRadius: "6px",
					padding: "0 6px",
					margin: "0 1px",
					fontSize: "0.8125rem",
					fontWeight: 500,
					lineHeight: "1.4",
					background: "var(--wc-accent-subtle, rgba(120,120,255,0.18))",
					color: "var(--wc-accent-fg, var(--wc-text-primary))",
					userSelect: "none",
				}}
			>
				/{name}
			</span>
		</NodeViewWrapper>
	);
};

export const SlashCommandNode = Node.create({
	name: "slashCommand",
	group: "inline",
	inline: true,
	atom: true,
	selectable: true,
	addAttributes() {
		return {
			name: { default: "" },
			args: { default: "" },
		};
	},
	parseHTML() {
		return [{ tag: "span[data-slash-command]" }];
	},
	renderHTML({ HTMLAttributes }) {
		return ["span", mergeAttributes(HTMLAttributes, { "data-slash-command": "" })];
	},
	addNodeView() {
		return ReactNodeViewRenderer(SlashPill);
	},
	addProseMirrorPlugins() {
		return [
			Suggestion({
				editor: this.editor,
				...commandSuggestion,
			}),
		];
	},
});