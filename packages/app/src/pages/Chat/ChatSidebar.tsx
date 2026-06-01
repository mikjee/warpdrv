import React, { useEffect } from 'react';
import { Box, Flex } from '@chakra-ui/react';
import { Settings, ChevronRight, SearchIcon } from 'lucide-react';
import { Plug } from 'lucide-react';
import { ChatConfigContentPanel } from './ChatConfigSidebar';
import { ChatToolsContentPanel } from './ChatToolsSidebar';
import { ThreadSearchPanel } from './ThreadSearchPanel';
import type { IChatInferenceParams, IChatPreset } from '@warpcore/shared';
import { LuPlug, LuSlidersHorizontal } from 'react-icons/lu';
import { VscTools } from 'react-icons/vsc';
import { useStore } from '@/store';
import { useShallow } from 'zustand/react/shallow';

interface IChatSidebarProps {
	configParams: IChatInferenceParams;
	configSystemPrompt: string;
	configSelectedPresetId: string | null;
	onConfigParamsChange: (params: IChatInferenceParams) => void;
	onConfigSystemPromptChange: (prompt: string) => void;
	onConfigPresetSelect: (presetId: string | null, preset: IChatPreset | null) => void;
}

export const ChatSidebar = React.memo(({
	configParams,
	configSystemPrompt,
	configSelectedPresetId,
	onConfigParamsChange,
	onConfigSystemPromptChange,
	onConfigPresetSelect,
}: IChatSidebarProps) => {
	const chatSidebarOpen = useStore(s => s.chatSidebarOpen);
	const chatSidebarTab = useStore(s => s.chatSidebarTab);
	const setChatSidebarOpen = useStore(s => s.setChatSidebarOpen);
	const openChatSidebarTab = useStore(s => s.openChatSidebarTab);
	const currentThreadId = useStore(s => s.currentThreadId);

	// ESC to close sidebar when in search mode
	useEffect(() => {
		if (!chatSidebarOpen || chatSidebarTab !== 'search') return;
		const handler = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				e.preventDefault();
				setChatSidebarOpen(false);
			}
		};
		document.addEventListener('keydown', handler);
		return () => document.removeEventListener('keydown', handler);
	}, [chatSidebarOpen, chatSidebarTab, setChatSidebarOpen]);

	const toggleTab = (tab: 'config' | 'tools' | 'search') => {
		if (chatSidebarTab === tab && chatSidebarOpen) {
			setChatSidebarOpen(false);
		} else {
			openChatSidebarTab(tab);
		}
	};

	return (
		<Flex direction="row" h="100%" borderLeftWidth="1px" borderColor="var(--wc-border-subtle)">
			{/* Content panel (conditional) */}
			{chatSidebarOpen && (
				<Box
					w="300px"
					overflowY="auto"
					css={{
						'&::-webkit-scrollbar': { width: '4px' },
						'&::-webkit-scrollbar-thumb': { background: 'var(--wc-text-disabled)', borderRadius: '2px' },
					}}
				>
					{chatSidebarTab === 'config' ? (
						<ChatConfigContentPanel
							params={configParams}
							systemPrompt={configSystemPrompt}
							selectedPresetId={configSelectedPresetId}
							onParamsChange={onConfigParamsChange}
							onSystemPromptChange={onConfigSystemPromptChange}
							onPresetSelect={onConfigPresetSelect}
						/>
					) : chatSidebarTab === 'tools' ? (
						<ChatToolsContentPanel threadId={currentThreadId} />
					) : (
						<ThreadSearchPanel threadId={currentThreadId} />
					)}
				</Box>
			)}

			{/* Tab strip (always visible on right edge) */}
			<Flex
				w="60px"
				borderLeftWidth="1px"
 borderColor="var(--wc-border-subtle)"
				flexDirection="column"
				alignItems="center"
				pt="2"
			>
				{/* Config tab */}
				<Flex
					onClick={() => toggleTab('config')}
					px="3"
					py="2.5"
					borderRadius="lg"
					cursor="pointer"
					transition="all 0.15s"
					bg={chatSidebarTab === 'config' && chatSidebarOpen ? 'var(--wc-bg-card)' : 'transparent'}
					borderWidth="1px"
					borderColor={chatSidebarTab === 'config' && chatSidebarOpen ? 'var(--wc-border-default)' : 'transparent'}
					_hover={{ bg: 'var(--wc-bg-card)', color: 'var(--wc-text-primary)' }}
				>
					<LuSlidersHorizontal size={18} color={chatSidebarTab === 'config' && chatSidebarOpen ? 'var(--wc-text-primary)' : 'var(--wc-text-muted)'} />
				</Flex>

				{/* Tools tab */}
				<Flex
					mt="1"
					onClick={() => toggleTab('tools')}
					px="3"
					py="2.5"
					borderRadius="lg"
					cursor="pointer"
					transition="all 0.15s"
					bg={chatSidebarTab === 'tools' && chatSidebarOpen ? 'var(--wc-bg-card)' : 'transparent'}
					borderWidth="1px"
					borderColor={chatSidebarTab === 'tools' && chatSidebarOpen ? 'var(--wc-border-default)' : 'transparent'}
					_hover={{ bg: 'var(--wc-bg-card)', color: 'var(--wc-text-primary)' }}
				>
					<Plug size={18} color={chatSidebarTab === 'tools' && chatSidebarOpen ? 'var(--wc-text-primary)' : 'var(--wc-text-muted)'} />
				</Flex>

				{/* Search tab */}
				<Flex
					mt="1"
					onClick={() => toggleTab('search')}
					px="3"
					py="2.5"
					borderRadius="lg"
					cursor="pointer"
					transition="all 0.15s"
					bg={chatSidebarTab === 'search' && chatSidebarOpen ? 'var(--wc-bg-card)' : 'transparent'}
					borderWidth="1px"
					borderColor={chatSidebarTab === 'search' && chatSidebarOpen ? 'var(--wc-border-default)' : 'transparent'}
					_hover={{ bg: 'var(--wc-bg-card)', color: 'var(--wc-text-primary)' }}
				>
					<SearchIcon size={18} color={chatSidebarTab === 'search' && chatSidebarOpen ? 'var(--wc-text-primary)' : 'var(--wc-text-muted)'} />
				</Flex>

				{/* Close button (only when open) */}
				{chatSidebarOpen && (
					<Flex
						mt="auto"
						mb="2"
						px="3"
						py="2.5"
						borderRadius="lg"
						cursor="pointer"
						transition="all 0.15s"
						borderWidth="1px"
						borderColor="transparent"
						_hover={{ bg: 'var(--wc-bg-card)' }}
						onClick={() => setChatSidebarOpen(false)}
					>
						<ChevronRight size={18} color="var(--wc-text-muted)" />
					</Flex>
				)}
			</Flex>
		</Flex>
	);
});
