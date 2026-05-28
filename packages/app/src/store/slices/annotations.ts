import type { AppState, ImmerSet, ImmerGet } from '../types';

export interface IAnnotation {
	id: string;
	selectedText: string;
	comment: string;
}

interface AnnotationsSlice {
	annotations: IAnnotation[];
	annotatorVisible: boolean;
	addAnnotation: (selectedText: string, comment: string) => void;
	removeAnnotation: (id: string) => void;
	clearAnnotations: () => void;
	setAnnotatorVisible: (v: boolean) => void;
}

export const annotationsSlice = (
	setState: ImmerSet<AppState>,
	_getState: ImmerGet<AppState>,
): Partial<AppState> => ({
	annotations: [],
	annotatorVisible: false,
	addAnnotation: (selectedText, comment) => {
		setState(draft => {
			draft.annotations.push({
				id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
				selectedText,
				comment,
			});
		});
	},
	removeAnnotation: (id) => {
		setState(draft => {
			draft.annotations = draft.annotations.filter(a => a.id !== id);
		});
	},
	clearAnnotations: () => {
		setState(draft => {
			draft.annotations = [];
		});
	},
	setAnnotatorVisible: (v) => {
		setState(draft => {
			draft.annotatorVisible = v;
		});
	},
});
