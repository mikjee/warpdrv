import { ReactRenderer } from "@tiptap/react";
import { computePosition, flip, shift, offset } from "@floating-ui/dom";
import type { SuggestionOptions } from "@tiptap/suggestion";
import { useStore } from "@/store";
import type { ISlashCommand } from "@/store/slices/slashCommands";
import { CommandList, type ICommandListRef } from "./CmdList";

function fuzzyMatch(text: string, query: string): boolean {
	let qi = 0;
	for (let ti = 0; ti < text.length && qi < query.length; ti++) {
		if (text[ti] === query[qi]) qi++;
	}
	return qi === query.length;
}

export const commandSuggestion: Omit<SuggestionOptions, "editor"> = {
	char: "/",
	startOfLine: false,
	allowSpaces: false,
	items: ({ query }) => {
		const q = query.toLowerCase();
		const matched = new Set<ISlashCommand>();
		for (const c of Object.values(useStore.getState().slashCommands)) {
			if (fuzzyMatch(c.name.toLowerCase(), q) ||
				c.tags?.some(tag => fuzzyMatch(tag.toLowerCase(), q))) {
				matched.add(c);
			}
		}
		return Array.from(matched);
	},
	command: ({ editor, range, props }) => {
		editor
			.chain()
			.insertContentAt(range, [
				{ type: "slashCommand", attrs: { name: props.name, args: "{}", autofocus: true } },
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
				if (props.event.key === "Tab") {
					props.event.preventDefault();
				}
				const handled = component?.ref?.onKeyDown(props.event) ?? false;
				return handled;
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