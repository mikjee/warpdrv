import { useImperativeHandle, forwardRef } from "react";
import { useEditor, EditorContent, Extension, type Editor } from "@tiptap/react";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import HardBreak from "@tiptap/extension-hard-break";
import { SlashCommandNode } from "./SlashCmdNode";
import { docToString } from "./docToString";
import { setActiveComposerEditor, clearActiveComposerEditor } from "./composerEditorRegistry";

export interface IWarpComposerEditorRef {
	insertText: (text: string) => void;
	focus: () => void;
	clear: () => void;
	getEditor: () => Editor | null;
}

interface IProps {
	placeholder?: string;
	onChangeText: (text: string) => void;
	onEnter: () => void;
	className?: string;
}

// drives Enter=send, Shift-Enter=newline
const makeKeymap = (onEnter: () => void) =>
	Extension.create({
		name: "warpComposerKeymap",
		addKeyboardShortcuts() {
			return {
				Enter: () => {
					onEnter();
					return true;
				},
				"Shift-Enter": () => this.editor.commands.setHardBreak(),
			};
		},
	});

export const ComposerEditor = forwardRef<IWarpComposerEditorRef, IProps>((props, ref) => {
	const editor = useEditor({
		extensions: [
			Document,
			Paragraph,
			Text,
			HardBreak,
			makeKeymap(props.onEnter),
			SlashCommandNode,
		],
		editorProps: {
			attributes: {
				class: "aui-composer-input",
				"aria-label": "Message input",
				style: "outline: none;",
			},
		},
		onUpdate: ({ editor }) => {
			props.onChangeText(docToString(editor.getJSON()));
		},
		onCreate: ({ editor }) => {
			console.log("[register] onCreate fired", !!editor);
			setActiveComposerEditor(editor); 
		},
		onDestroy: () => {
			if (editor) clearActiveComposerEditor(editor);
		},
	});

	useImperativeHandle(ref, () => ({
		insertText: (text: string) => {
			editor?.chain().focus().insertContent(text).run();
		},
		focus: () => editor?.commands.focus(),
		clear: () => editor?.commands.clearContent(true),
		getEditor: () => editor,
	}), [editor]);

	return <EditorContent editor={editor} className={props.className} />;
});

ComposerEditor.displayName = "ComposerEditor";