import React, { useState } from 'react';
import { Box, Text, HStack, VStack } from '@chakra-ui/react';
import { FolderOpen, ChevronDown, ChevronRight, File, Folder } from 'lucide-react';
import { extractResultText } from './utils';
import type { IToolCallRenderer, TCanRenderResult } from '@/store/types';

interface ITreeEntry {
	name: string;
	type: 'file' | 'directory';
	children?: ITreeEntry[];
}

function parseEntries(text: string): ITreeEntry[] | null {
	try {
		const parsed = JSON.parse(text);
		if (Array.isArray(parsed)) return parsed as ITreeEntry[];
		return null;
	} catch {
		return null;
	}
}

function parseFlatLines(text: string): ITreeEntry[] {
	const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
	return lines.map(line => {
		if (line.startsWith('[DIR]')) return { name: line.replace(/^\[DIR\]\s*/, ''), type: 'directory' as const };
		if (line.startsWith('[FILE]')) return { name: line.replace(/^\[FILE\]\s*/, ''), type: 'file' as const };
		return { name: line, type: 'file' as const };
	});
}

const TreeNode = React.memo(({ entry, depth }: { entry: ITreeEntry, depth: number }) => {
	const [open, setOpen] = useState(depth < 1);
	const isDir = entry.type === 'directory';
	const hasChildren = isDir && Array.isArray(entry.children) && entry.children.length > 0;
	return (
		<Box>
			<HStack gap="1" pl={`${depth * 12}px`} py="0" align="center" cursor={hasChildren ? 'pointer' : 'default'} onClick={() => hasChildren && setOpen(!open)}>
				{hasChildren ? (open ? <ChevronDown size={10} /> : <ChevronRight size={10} />) : <Box w="10px" />}
				{isDir ? <Folder size={11} color="var(--wc-text-secondary)" /> : <File size={11} color="var(--wc-text-faint)" />}
				<Text fontSize="11px" fontFamily="mono" color={isDir ? 'var(--wc-text-primary)' : 'var(--wc-text-secondary)'}>
					{entry.name}
				</Text>
			</HStack>
			{hasChildren && open && entry.children!.map((c, i) => (
				<TreeNode key={`${c.name}-${i}`} entry={c} depth={depth + 1} />
			))}
		</Box>
	);
});

export const ListRenderer = React.memo((props: {
	path?: string,
	excludePatterns?: string[],
	result?: unknown,
}) => {
	const { path, excludePatterns, result } = props;
	const resultText = extractResultText(result);
	const entries = resultText ? (parseEntries(resultText) ?? parseFlatLines(resultText)) : null;
	return (
		<Box px="3" py="2">
			<HStack gap="2" align="center" mb={entries ? '2' : '0'}>
				<FolderOpen size={13} color="var(--wc-text-secondary)" />
				<Text fontSize="12px" fontFamily="mono" color="var(--wc-text-primary)" wordBreak="break-all">
					{path ?? '(no path)'}
				</Text>
				{excludePatterns && excludePatterns.length > 0 && (
					<Text fontSize="10px" color="var(--wc-text-faint)">
						excl: {excludePatterns.join(', ')}
					</Text>
				)}
			</HStack>
			{entries && entries.length > 0 && (
				<Box bg="var(--wc-overlay-dim)" borderRadius="sm" p="2" overflow="auto" maxH="300px">
					<VStack gap="0" align="stretch">
						{entries.map((e, i) => (
							<TreeNode key={`${e.name}-${i}`} entry={e} depth={0} />
						))}
					</VStack>
		</Box>
		)}
		</Box>
	);
});

export const ListRendererMeta: IToolCallRenderer = {
	component: ListRenderer,
	keywords: ['list', 'ls', 'dir', 'directory', 'tree', 'browse'],
	canRender: (args: Record<string, unknown>): TCanRenderResult => {
		const path = args.path ?? args.dir ?? args.directory ?? args.folder ?? args.file_path;
		if (typeof path !== 'string' || path.length === 0) return false;
		const excludePatterns = args.excludePatterns ?? args.exclude ?? args.ignore;
		return {
			path,
			excludePatterns: Array.isArray(excludePatterns) ? excludePatterns : undefined,
		};
	},
};
