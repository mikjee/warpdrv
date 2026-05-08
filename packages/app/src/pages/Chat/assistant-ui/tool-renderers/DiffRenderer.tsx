import React from 'react';
import { Box, Text, HStack, VStack } from '@chakra-ui/react';
import { FileText } from 'lucide-react';
import ReactDiffViewer from 'react-diff-viewer-continued';
import type { IToolCallRenderer, TCanRenderResult } from '@/store/types';

export enum EDiffStrategy {
	FIND_REPLACE = 'find_replace',
	EDITS_ARRAY = 'edits_array',
	FULL_WRITE = 'full_write',
}

interface IEdit {
	oldText?: string;
	newText?: string;
}

export const DiffRenderer = React.memo((props: {
	path?: string,
	old?: string,
	new?: string,
	edits?: IEdit[],
	content?: string,
	strategy?: EDiffStrategy,
}) => {
	const { path, old, new: newVal, edits, content, strategy } = props;

	return (
		<Box px="3" py="2">
			<HStack gap="2" align="center" mb="2">
				<FileText size={13} color="var(--wc-text-secondary)" />
				<Text fontSize="12px" fontFamily="mono" color="var(--wc-text-primary)" wordBreak="break-all">
					{path ?? '(no path)'}
				</Text>
			</HStack>

			{strategy === EDiffStrategy.FIND_REPLACE && (
				<ReactDiffViewer
					oldValue={old ?? ''}
					newValue={newVal ?? ''}
					splitView={true}
					hideLineNumbers={false}
				/>
			)}

			{strategy === EDiffStrategy.EDITS_ARRAY && (
				<VStack gap="2" align="stretch">
					{(edits ?? []).map((e, i) => (
						<Box key={i} borderWidth="1px" borderColor="var(--wc-border-subtle)" borderRadius="sm" overflow="hidden">
							<ReactDiffViewer
								oldValue={e.oldText ?? ''}
								newValue={e.newText ?? ''}
								splitView={true}
								hideLineNumbers={false}
								useDarkTheme={true}  // or false based on your app theme
								styles={{
									variables: {
										dark: {
											diffViewerBackground: 'var(--wc-bg-surface)',
											diffViewerColor: 'var(--wc-text-primary)',
											addedBackground: 'var(--wc-accent-green-bg-15)',
											addedColor: 'var(--wc-accent-green)',
											removedBackground: 'var(--wc-accent-red-bg-12)',
											removedColor: 'var(--wc-accent-red-alt)',
											wordAddedBackground: 'var(--wc-accent-green-hover)',
											wordRemovedBackground: 'var(--wc-accent-red-hover)',
											addedGutterBackground: 'var(--wc-accent-green-bg-15)',
											removedGutterBackground: 'var(--wc-accent-red-bg-12)',
											gutterBackground: 'var(--wc-bg-surface)',
											gutterBackgroundDark: 'var(--wc-bg-surface)',
											highlightBackground: 'var(--wc-overlay-dim)',
											highlightGutterBackground: 'var(--wc-overlay-dim)',
											codeFoldBackground: 'var(--wc-bg-surface)',
											emptyLineBackground: 'var(--wc-bg-surface)',
											gutterColor: 'var(--wc-text-faint)',
											addedGutterColor: 'var(--wc-accent-green)',
											removedGutterColor: 'var(--wc-accent-red-alt)',
											codeFoldContentColor: 'var(--wc-text-muted)',
											diffViewerTitleBackground: 'var(--wc-bg-surface)',
											diffViewerTitleColor: 'var(--wc-text-primary)',
											diffViewerTitleBorderColor: 'var(--wc-border-default)',
										},
									}
								}}
							/>
						</Box>
					))}
				</VStack>
			)}

			{strategy === EDiffStrategy.FULL_WRITE && (
				<Box bg="var(--wc-overlay-dim)" borderRadius="sm" p="2" overflow="auto" maxH="400px">
					<Text fontSize="11px" fontFamily="mono" color="var(--wc-text-secondary)" whiteSpace="pre-wrap">
						{content ?? ''}
					</Text>
				</Box>
			)}
		</Box>
	);
});

export const DiffRendererMeta: IToolCallRenderer = {
	component: DiffRenderer,
	keywords: ['edit', 'write', 'replace', 'modify', 'patch', 'apply', 'create'],
	canRender: (args: Record<string, unknown>): TCanRenderResult => {
		const path = (args.path ?? args.file_path ?? args.filepath ?? args.filename ?? args.file) as string | undefined;
		// FIND_REPLACE: old/new strings under various names
		const oldStr = args.old_string ?? args.oldText ?? args.old_str ?? args.old ?? args.search;
		const newStr = args.new_string ?? args.newText ?? args.new_str ?? args.new ?? args.replace;
		if (typeof oldStr === 'string' && typeof newStr === 'string') {
			return { path, old: oldStr, new: newStr, strategy: EDiffStrategy.FIND_REPLACE };
		}
		// EDITS_ARRAY
		if (Array.isArray(args.edits) && args.edits.length > 0) {
			return { path, edits: args.edits as IEdit[], strategy: EDiffStrategy.EDITS_ARRAY };
		}
		// FULL_WRITE: path + content
		const content = args.content ?? args.text ?? args.body;
		if (typeof content === 'string' && typeof path === 'string') {
			return { path, content, strategy: EDiffStrategy.FULL_WRITE };
		}
		return false;
	},
};