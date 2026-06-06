import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import type { SuggestionProps } from "@tiptap/suggestion";

export interface ICommandListRef {
	onKeyDown: (event: KeyboardEvent) => boolean;
}

export const CommandList = forwardRef<ICommandListRef, SuggestionProps<{ name: string }>>((props, ref) => {
	const [selected, setSelected] = useState(0);
	useEffect(() => {
		setSelected(0);
	}, [props.items]);
	const select = (index: number) => {
		const item = props.items[index];
		if (item) props.command(item);
	};
	useImperativeHandle(ref, () => ({
		onKeyDown: (event) => {
			if (event.key === "ArrowUp") {
				setSelected(s => (s + props.items.length - 1) % props.items.length);
				return true;
			}
			if (event.key === "ArrowDown") {
				setSelected(s => (s + 1) % props.items.length);
				return true;
			}
			if (event.key === "Enter") {
				select(selected);
				return true;
			}
			return false;
		},
	}));
	if (props.items.length === 0) return null;
	return (
		<div
			className="aui-slash-menu"
			style={{
				minWidth: "160px",
				borderRadius: "8px",
				border: "1px solid var(--wc-border-default)",
				background: "var(--wc-bg-elevated)",
				boxShadow: "0px 8px 24px rgba(0,0,0,0.25)",
				padding: "4px",
				overflow: "hidden",
			}}
		>
			{props.items.map((item, index) => (
				<button
					key={item.name}
					onMouseEnter={() => setSelected(index)}
					onClick={() => select(index)}
					style={{
						display: "block",
						width: "100%",
						textAlign: "left",
						padding: "6px 8px",
						borderRadius: "6px",
						fontSize: "0.8125rem",
						color: "var(--wc-text-primary)",
						background: index === selected ? "var(--wc-bg-hover, rgba(255,255,255,0.06))" : "transparent",
						cursor: "pointer",
					}}
				>
					/{item.name}
				</button>
			))}
		</div>
	);
});

CommandList.displayName = "CommandList";