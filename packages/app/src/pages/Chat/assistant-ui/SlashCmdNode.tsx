import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import Suggestion from "@tiptap/suggestion";
import { useStore } from "@/store";
import { commandSuggestion } from "./CmdSuggestion";

// paramType -> slot renderer; only "default" wired now, dropdown/event-fed types added later
type TSlotRenderer = (args: {
	value: string;
	placeholder: string;
	onChange: (next: string) => void;
}) => React.ReactNode;
const SLOT_RENDERERS: Record<string, TSlotRenderer> = {
	default: ({ value, placeholder, onChange }) => (
		<input
			type="text"
			value={value}
			placeholder={placeholder}
			onChange={(e) => onChange(e.target.value)}
			style={{
				background: "var(--wc-bg-subtle, rgba(255,255,255,0.06))",
				border: "none",
				borderRadius: "4px",
				color: "inherit",
				font: "inherit",
				padding: "0 4px",
				margin: "0 2px",
				width: `${Math.max(placeholder.length, value.length, 4)}ch`,
				outline: "none",
			}}
		/>
	),
};

const parseArgs = (raw: string): Record<string, string> => {
	try {
		return JSON.parse(raw || "{}") as Record<string, string>;
	} catch {
		return {};
	}
};

const SlashPill: React.FC<NodeViewProps> = (props) => {
	const name = props.node.attrs.name as string;
	const args = parseArgs(props.node.attrs.args as string);
	const command = useStore((s) => s.slashCommands[name]);
	const paramEntries = command
		? Object.entries(command.params).sort((a, b) => a[1].index - b[1].index)
		: [];
	const setArg = (key: string, next: string) => {
		const updated = { ...parseArgs(props.node.attrs.args as string), [key]: next };
		props.updateAttributes({ args: JSON.stringify(updated) });
	};
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
				{paramEntries.map(([key, param]) => {
					const renderer = SLOT_RENDERERS[param.type] ?? SLOT_RENDERERS.default;
					return (
						<span key={key} style={{ display: "inline-flex", alignItems: "center" }}>
							{renderer({
								value: args[key] ?? "",
								placeholder: `<${param.type}>`,
								onChange: (next) => setArg(key, next),
							})}
						</span>
					);
				})}
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
			args: { default: "{}" },
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