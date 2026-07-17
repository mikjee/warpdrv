import { useState, useRef, useCallback, useEffect } from 'react';
import { Input, Button, HStack, Text } from '@chakra-ui/react';
import { FolderInput } from 'lucide-react';
import { useStore } from '@/store';
import { useDependantState } from '@/hooks/useDependantState';

export const ProjectRootPicker = () => {
	const currentThreadId = useStore(s => s.currentThreadId);
	const activeWorkspaceId = useStore(s => s.activeWorkspaceId);
	const projectRoot = useStore(s =>
		currentThreadId ? s.threadStates[currentThreadId]?.projectRoot : s.tempThreadState?.projectRoot
	);
	const workspaceProjectRoot = useStore(s => activeWorkspaceId ? s.workspaceStates[activeWorkspaceId]?.projectRoot : undefined);
	const setThreadState = useStore(s => s.setThreadState);

	const [value, setValue] = useDependantState(projectRoot as string || '');
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const flush = useCallback(() => {
		if (!currentThreadId || !value.trim()) return;
		setThreadState(currentThreadId, { projectRoot: value });
	}, [currentThreadId, setThreadState, value]);

	useEffect(() => {
		return () => {
			if (timerRef.current) {
				clearTimeout(timerRef.current);
				flush();
			}
		};
	}, [flush]);

	return (
		<>
			{workspaceProjectRoot && (
				<Text fontSize="10px" color="var(--wc-text-faint)" mb="1" fontFamily="monospace">
					Workspace root: {workspaceProjectRoot}
				</Text>
			)}
			<HStack gap="2">
			<Input
				size="xs"
				fontSize="12px"
				value={value}
				onChange={(e) => {
					if (!currentThreadId) return;
					if (timerRef.current) clearTimeout(timerRef.current);
					setValue(e.target.value);
					timerRef.current = setTimeout(flush, 400);
				}}
				onBlur={flush}
				placeholder="No project root set"
				fontFamily='"Geist Mono", monospace'
				bg="var(--wc-bg-card)"
				borderColor="var(--wc-border-default)"
				color="var(--wc-text-primary)"
				_focus={{ borderColor: 'var(--wc-accent-blue-focus)', outline: 'none' }}
			/>
			<BrowseButton />
		</HStack>
		</>
	);
};

const BrowseButton = () => {
	const currentThreadId = useStore(s => s.currentThreadId);
	const setThreadState = useStore(s => s.setThreadState);

	return (
		<Button
			size="xs"
			variant="ghost"
			color="var(--wc-text-secondary)"
			_hover={{ color: 'var(--wc-accent-purple)', bg: 'var(--wc-accent-purple-hover-bg)' }}
			borderRadius="lg"
			minW="8"
			px="0"
			onClick={async () => {
				const selectPath = async (): Promise<string | null> => {
					if (typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__) {
						const mod = await import('@tauri-apps/plugin-dialog');
						return mod.open({ directory: true, multiple: false }) as Promise<string | null>;
					}
					if (typeof window !== 'undefined' && 'showDirectoryPicker' in window) {
						const handle = await (window as any).showDirectoryPicker();
						return handle.name;
					}
					return null;
				};
				const path = await selectPath();
				if (path && typeof path === 'string' && currentThreadId) {
					setThreadState(currentThreadId, { projectRoot: path });
				}
			}}
			title="Browse directory"
		>
			<FolderInput size={14} />
		</Button>
	);
};
