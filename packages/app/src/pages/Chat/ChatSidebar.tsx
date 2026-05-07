import React, { useState } from 'react';
import { Box, Flex } from '@chakra-ui/react';
import { Settings, ChevronRight } from 'lucide-react';
import { Plug } from 'lucide-react';
import { ChatConfigContentPanel } from './ChatConfigSidebar';
import { ChatToolsContentPanel } from './ChatToolsSidebar';
import type { IChatInferenceParams, IChatPreset } from '@warpcore/shared';
import { LuPlug, LuSlidersHorizontal } from 'react-icons/lu';
import { VscTools } from 'react-icons/vsc';

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
	const [open, setOpen] = useState(false);
	const [activeTab, setActiveTab] = useState<'config' | 'tools'>('config');

	return (
		<Flex direction="row" h="100%" borderLeftWidth="1px" borderColor="var(--wc-border-subtle)">
			{/* Content panel (conditional) */}
			{open && (
				<Box
					w="300px"
					// bg="rgba(0,0,0,0.15)"
					overflowY="auto"
					css={{
						'&::-webkit-scrollbar': { width: '4px' },
						'&::-webkit-scrollbar-thumb': { background: 'var(--wc-text-disabled)', borderRadius: '2px' },
					}}
				>
					{activeTab === 'config' ? (
						<ChatConfigContentPanel
							params={configParams}
							systemPrompt={configSystemPrompt}
							selectedPresetId={configSelectedPresetId}
							onParamsChange={onConfigParamsChange}
							onSystemPromptChange={onConfigSystemPromptChange}
							onPresetSelect={onConfigPresetSelect}
						/>
					) : (
						<ChatToolsContentPanel />
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
				// bg="rgba(0,0,0,0.05)"
			>
				{/* Config tab */}
				<Flex
					onClick={() => {
						if (activeTab === 'config' && open) {
							setOpen(false);
						} else {
							setActiveTab('config');
							setOpen(true);
						}
					}}
					px="3"
					py="2.5"
					borderRadius="lg"
					cursor="pointer"
					transition="all 0.15s"
					bg={activeTab === 'config' && open ? 'var(--wc-bg-card)' : 'transparent'}
					borderWidth="1px"
					borderColor={activeTab === 'config' && open ? 'var(--wc-border-default)' : 'transparent'}
					_hover={{ bg: 'var(--wc-bg-card)', color: 'var(--wc-text-primary)' }}
				>
					<LuSlidersHorizontal size={18} color={activeTab === 'config' && open ? 'var(--wc-text-primary)' : 'var(--wc-text-muted)'} />
				</Flex>

				{/* Tools tab */}
				<Flex
					mt="1"
					onClick={() => {
						if (activeTab === 'tools' && open) {
							setOpen(false);
						} else {
							setActiveTab('tools');
							setOpen(true);
						}
					}}
					px="3"
					py="2.5"
					borderRadius="lg"
					cursor="pointer"
					transition="all 0.15s"
					bg={activeTab === 'tools' && open ? 'var(--wc-bg-card)' : 'transparent'}
					borderWidth="1px"
					borderColor={activeTab === 'tools' && open ? 'var(--wc-border-default)' : 'transparent'}
					_hover={{ bg: 'var(--wc-bg-card)', color: 'var(--wc-text-primary)' }}
				>
					<Plug size={18} color={activeTab === 'tools' && open ? 'var(--wc-text-primary)' : 'var(--wc-text-muted)'} />
				</Flex>

				{/* Close button (only when open) */}
				{open && (
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
						onClick={() => setOpen(false)}
					>
						<ChevronRight size={18} color="var(--wc-text-muted)" />
					</Flex>
				)}
			</Flex>
		</Flex>
	);
});
