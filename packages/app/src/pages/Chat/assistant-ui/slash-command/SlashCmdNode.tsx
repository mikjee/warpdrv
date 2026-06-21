import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { computePosition, flip, shift, offset } from "@floating-ui/dom";
import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import Suggestion from "@tiptap/suggestion";
import { useStore } from "@/store";
import { commandSuggestion } from "./CmdSuggestion";
import { SlashCmdServerSelector } from "./SlashCmdServerSelector";
import { SlashCmdDropdown } from "./SlashCmdDropdown";
import { SlashCmdDefaultInput } from "./SlashCmdDefaultInput";

// paramType -> slot renderer; "default", "server", and "dropdown" wired, additional types added as needed
type TSlotRendererProps = {
	value: string;
	placeholder: string;
	inputRef: (el: HTMLInputElement | null) => void;
	onChange: (next: string) => void;
	onKeyDown: (e: React.KeyboardEvent) => void;
	onFocus: () => void;
	onBlur: (e: React.FocusEvent) => void;
};
type TSlotRenderer = React.FC<TSlotRendererProps & Record<string, unknown>>;
const SLOT_RENDERERS: Record<string, TSlotRenderer> = {
	default: SlashCmdDefaultInput,
	server: SlashCmdServerSelector,
	dropdown: SlashCmdDropdown,
};

const parseArgs = (raw: string): Record<string, string> => {
	try {
		return JSON.parse(raw || "{}") as Record<string, string>;
	} catch {
		return {};
	}
};

interface ICommandCardProps {
	name: string;
	description: string;
	params: Array<[string, { type: string; description: string; index: number }]>;
	focusedKey: string | null;
	cardRef: (el: HTMLDivElement | null) => void;
}
const CommandCard: React.FC<ICommandCardProps> = (p) => createPortal(
	<div
		ref={p.cardRef}
		contentEditable={false}
		style={{
			position: "absolute",
			zIndex: 9999,
			minWidth: "320px",
			maxWidth: "480px",
			borderRadius: "8px",
			border: "1px solid var(--wc-border-default)",
			background: "var(--wc-bg-elevated)",
			boxShadow: "0px 8px 24px rgba(0,0,0,0.25)",
			padding: "10px 12px",
			fontSize: "0.8125rem",
			fontWeight: 400,
			lineHeight: "1.4",
			color: "var(--wc-text-primary)",
			userSelect: "none",
		}}
	>
		<div style={{ fontWeight: 600 }}>/{p.name}</div>
		{p.description ? (
			<div style={{ color: "var(--wc-text-tertiary)", marginTop: "2px" }}>{p.description}</div>
		) : null}
{p.params.length > 0 ? (
			<div style={{ marginTop: "8px", border: "1px solid var(--wc-border-subtle, rgba(255,255,255,0.08))", borderRadius: "6px" }}>
				<table style={{ width: "100%", borderCollapse: "collapse" }}>
					<tbody>
					{p.params.map(([key, param]) => {
						const active = key === p.focusedKey;
						return (
							<tr
								key={key}
								style={{
									background: active ? "var(--wc-bg-hover, rgba(255,255,255,0.06))" : "transparent",
								}}
							>
								<td style={{ padding: "4px 8px", verticalAlign: "top", whiteSpace: "nowrap", borderTop: "1px solid var(--wc-border-subtle, rgba(255,255,255,0.08))", borderRight: "1px solid var(--wc-border-subtle, rgba(255,255,255,0.08))" }}>
									<div style={{ fontWeight: 600 }}>{key}</div>
									<div style={{ color: "var(--wc-text-tertiary)", fontStyle: "italic", fontSize: "0.75rem", fontFamily: "var(--wc-font-mono, monospace)" }}>{param.type}</div>
								</td>
								<td style={{ padding: "4px 8px", verticalAlign: "top", color: "var(--wc-text-secondary)", borderTop: "1px solid var(--wc-border-subtle, rgba(255,255,255,0.08))" }}>
									{param.description ?? ""}
								</td>
							</tr>
						);
					})}
				</tbody>
				</table>
			</div>
		) : null}
	</div>,
	document.body,
);
const SlashPill: React.FC<NodeViewProps> = (props) => {
	const name = props.node.attrs.name as string;
	const args = parseArgs(props.node.attrs.args as string);
	const command = useStore((s) => s.slashCommands[name]);
	const slotRefs = useRef<Array<HTMLInputElement | null>>([]);
	const paramEntries = command
		? Object.entries(command.params).sort((a, b) => a[1].index - b[1].index)
		: [];
	useEffect(() => {
		if (props.node.attrs.autofocus) {
			const id = requestAnimationFrame(() => {
				slotRefs.current[0]?.focus();
				props.updateAttributes({ autofocus: false });
			});
			return () => cancelAnimationFrame(id);
		}
	}, [props.node.attrs.autofocus]);
	const onSlotKeyDown = (i: number, e: React.KeyboardEvent) => {
		if (e.key === "Tab" && !e.shiftKey) {
			e.preventDefault();
			const next = slotRefs.current[i + 1];
			if (next) next.focus();
			else props.editor.commands.focus();
		} else if (e.key === "Tab" && e.shiftKey) {
			const prev = slotRefs.current[i - 1];
			if (prev) { e.preventDefault(); prev.focus(); }
		}
	};
	const setArg = (key: string, next: string) => {
		const updated = { ...parseArgs(props.node.attrs.args as string), [key]: next };
		props.updateAttributes({ args: JSON.stringify(updated) });
	};
	const [focusedSlot, setFocusedSlot] = useState<number | null>(null);
	const [hovered, setHovered] = useState(false);
	const wrapRef = useRef<HTMLSpanElement | null>(null);
	const cardRef = useRef<HTMLDivElement | null>(null);
	const cardVisible = !!command && (hovered || focusedSlot !== null);
	useEffect(() => {
		if (!cardVisible || !wrapRef.current || !cardRef.current) return;
		computePosition(wrapRef.current, cardRef.current, {
			placement: "top-start",
			middleware: [offset(6), flip(), shift({ padding: 8 })],
		}).then(({ x, y }) => {
			if (!cardRef.current) return;
			cardRef.current.style.left = `${x}px`;
			cardRef.current.style.top = `${y}px`;
		});
	}, [cardVisible, focusedSlot, hovered]);
	const onSlotFocus = (i: number) => setFocusedSlot(i);
	const onSlotBlur = (e: React.FocusEvent) => {
		const next = e.relatedTarget as HTMLElement | null;
		if (next && slotRefs.current.includes(next as HTMLInputElement)) return;
		setFocusedSlot(null);
	};
	const focusedKey = focusedSlot !== null ? paramEntries[focusedSlot]?.[0] ?? null : null;
	return (
		<NodeViewWrapper className="inline" style={{ position: "relative", display: "inline-flex" }}>
			<span
				ref={wrapRef}
				contentEditable={false}
				className="aui-slash-pill"
				onMouseEnter={() => setHovered(true)}
				onMouseLeave={() => setHovered(false)}
				style={{
					display: "inline-flex",
					alignItems: "center",
					gap: "4px",
					borderRadius: "6px",
					padding: "0 6px",
					margin: "0 1px",
					fontSize: "0.8125rem",
					fontWeight: 500,
					lineHeight: "1.4",
					background: "var(--wc-accent-purple-bg-15, rgba(167,139,250,0.15))",
					border: "1px solid var(--wc-accent-purple-border, rgba(167,139,250,0.25))",
					color: "var(--wc-text-primary)",
					userSelect: "none",
				}}
			>
				<span style={{ fontWeight: 700 }}>/{name}</span>
				{paramEntries.map(([key, param], i) => {
					const Renderer = SLOT_RENDERERS[param.type] ?? SLOT_RENDERERS.default!;
					return (
						<span key={key} style={{ display: "inline-flex", alignItems: "center" }}>
							<Renderer
								value={args[key] ?? ""}
								placeholder={param.type}
								inputRef={(el) => { slotRefs.current[i] = el; }}
								onChange={(next) => setArg(key, next)}
								onKeyDown={(e) => onSlotKeyDown(i, e)}
								onFocus={() => onSlotFocus(i)}
								onBlur={onSlotBlur}
								{...(param.props as Record<string, unknown>)}
							/>
						</span>
					);
				})}
			</span>
			{cardVisible ? (
				<CommandCard
					name={name}
					description={command!.description}
					params={paramEntries}
					focusedKey={focusedKey}
					cardRef={(el) => { cardRef.current = el; }}
				/>
			) : null}
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
			autofocus: { default: false },
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