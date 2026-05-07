import { Box, Text, HStack, VStack, Flex, Badge } from '@chakra-ui/react';
import { Download, Heart, Clock } from 'lucide-react';
import type { IHubModel } from '@warpcore/shared';
import React from 'react';

function formatCount(n: number): string {
	if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
	if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
	return String(n);
}

function formatDate(dateStr: string): string {
	if (!dateStr) return '';
	const d = new Date(dateStr);
	const now = new Date();
	const diffMs = now.getTime() - d.getTime();
	const diffMinutes = Math.floor(diffMs / 60000);
	const diffHours = Math.floor(diffMs / 3600000);
	const diffDays = Math.floor(diffMs / 86400000);
	if (diffMinutes === 0) return 'Just now';
	if (diffMinutes < 60) return `${diffMinutes}min ago`;
	if (diffHours < 24) return `${diffHours}h ago`;
	if (diffDays === 1) return 'yesterday';
	if (diffDays < 30) return `${diffDays}d ago`;
	if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
	return `${Math.floor(diffDays / 365)}y ago`;
}

interface IHubModelCardProps {
	model: IHubModel;
	selected: boolean;
	onClick: () => void;
}

export const HubModelCard = React.memo(({ model, selected, onClick }: IHubModelCardProps)  => {
	const topTags = model.tags.filter(t =>
		!t.startsWith('license:') && !t.startsWith('region:') && t !== 'gguf'
	).slice(0, 3);

	return (
		<Box
			px="4" py="3" borderRadius="lg" cursor="pointer"
			bg={selected ? 'var(--wc-accent-blue-bg-8)' : 'var(--wc-bg-surface)'}
			borderWidth="1px"
			borderColor={selected ? 'var(--wc-accent-blue-border)' : 'var(--wc-border-subtle)'}
			_hover={{
				borderColor: selected ? 'var(--wc-accent-blue-strong)' : 'var(--wc-border-overlay)',
				bg: selected ? 'var(--wc-accent-blue-bg-10)' : 'var(--wc-bg-hover)',
			}}
			onClick={onClick}
			transition="all 0.15s ease"
		>
			<VStack align="stretch" gap="2">
				<Box>
					<Text fontSize="11px" color="var(--wc-text-faint)" mb="0.5">
						{model.author}
					</Text>
					<Text fontSize="13px" fontWeight="600" color="var(--wc-text-primary)" lineClamp={1}>
						{model.modelId}
					</Text>
				</Box>

				<HStack gap="3">
					<HStack gap="1" color="var(--wc-text-muted)">
						<Download size={11} />
						<Text fontSize="11px" fontFamily='"Geist Mono", monospace'>
							{formatCount(model.downloads)}
						</Text>
					</HStack>
					<HStack gap="1" color="var(--wc-text-muted)">
						<Heart size={11} />
						<Text fontSize="11px" fontFamily='"Geist Mono", monospace'>
							{formatCount(model.likes)}
						</Text>
					</HStack>
					<HStack gap="1" color="var(--wc-text-faint)">
						<Clock size={11} />
						<Text fontSize="11px">{formatDate(model.createdAt)}</Text>
					</HStack>
				</HStack>

				{topTags.length > 0 && (
					<HStack gap="1" flexWrap="wrap">
						{topTags.map((tag: string) => (
							<Badge
								key={tag} px="1.5" py="0" borderRadius="sm" fontSize="10px"
								bg="var(--wc-bg-card)" color="var(--wc-text-muted)"
								borderWidth="1px" borderColor="var(--wc-border-subtle)"
							>
								{tag}
							</Badge>
						))}
					</HStack>
				)}
			</VStack>
		</Box>
	);
});
