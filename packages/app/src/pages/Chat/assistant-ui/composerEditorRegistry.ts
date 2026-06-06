import type { Editor } from "@tiptap/react";

// module-level singleton for the active composer editor instance
// lets ComposerAction / dictation reach the editor without prop-drilling
let activeEditor: Editor | null = null;

export const setActiveComposerEditor = (editor: Editor | null): void => {
	activeEditor = editor;
};

export const clearActiveComposerEditor = (editor: Editor): void => {
	if (activeEditor === editor) activeEditor = null;
};

export const getActiveComposerEditor = (): Editor | null => {
	return activeEditor;
};

export const insertComposerText = (text: string): void => {
	if (!activeEditor) return;
	if (activeEditor.isDestroyed) return;
	const needsSpace = activeEditor.getText().length > 0 && !activeEditor.getText().endsWith(" ");
	activeEditor.chain().focus().insertContent((needsSpace ? " " : "") + text).run();
};

export const clearComposerEditor = (): void => {
	console.log("[clear] active?", !!activeEditor, "destroyed?", activeEditor?.isDestroyed);
	if (!activeEditor || activeEditor.isDestroyed) return;
	activeEditor.commands.clearContent(true);
};