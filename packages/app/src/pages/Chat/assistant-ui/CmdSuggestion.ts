import { ReactRenderer } from "@tiptap/react";
import { computePosition, flip, shift, offset } from "@floating-ui/dom";
import type { SuggestionOptions } from "@tiptap/suggestion";
import { CommandList, type ICommandListRef } from "./CmdList";

// hardcoded command set — registry is parked
const COMMANDS: Array<{ name: string }> = [{ name: "test" }];

export const commandSuggestion: Omit<SuggestionOptions, "editor"> = {
	char: "/",
	startOfLine: false,
	allowSpaces: false,
	items: ({ query }) => {
		return COMMANDS.filter(c => c.name.toLowerCase().startsWith(query.toLowerCase()));
	},
	command: ({ editor, range, props }) => {
		editor
			.chain()
			.focus()
			.insertContentAt(range, [
				{ type: "slashCommand", attrs: { name: props.name, args: "" } },
				{ type: "text", text: " " },
			])
			.run();
	},
	render: () => {
		let component: ReactRenderer<ICommandListRef> | null = null;
		let el: HTMLElement | null = null;
		const reposition = (clientRect: (() => DOMRect | null) | null | undefined) => {
			if (!el || !clientRect) return;
			const rect = clientRect();
			if (!rect) return;
			const virtual = { getBoundingClientRect: () => rect };
			computePosition(virtual as any, el, {
				placement: "top-start",
				middleware: [offset(6), flip(), shift({ padding: 8 })],
			}).then(({ x, y }) => {
				if (!el) return;
				el.style.left = `${x}px`;
				el.style.top = `${y}px`;
			});
		};
		return {
			onStart: (props) => {
				component = new ReactRenderer(CommandList, { props, editor: props.editor });
				el = document.createElement("div");
				el.style.position = "absolute";
				el.style.zIndex = "9999";
				el.appendChild(component.element);
				document.body.appendChild(el);
				reposition(props.clientRect);
			},
			onUpdate: (props) => {
				component?.updateProps(props);
				reposition(props.clientRect);
			},
			onKeyDown: (props) => {
				if (props.event.key === "Escape") {
					return true;
				}
				return component?.ref?.onKeyDown(props.event) ?? false;
			},
			onExit: () => {
				el?.remove();
				component?.destroy();
				el = null;
				component = null;
			},
		};
	},
};