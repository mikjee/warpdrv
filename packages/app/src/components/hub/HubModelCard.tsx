import { Box, Text, HStack, VStack, Flex, Badge } from '@chakra-ui/react';
import { Download, Heart, Clock } from 'lucide-react';
import type { IHubModel } from '@warpcore/shared';

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
	const diffDays = Math.floor(diffMs / 86400000);
	if (diffDays === 0) return 'today';
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

export function HubModelCard({ model, selected, onClick }: IHubModelCardProps) {
	const topTags = model.tags.filter(t =>
		!t.startsWith('license:') && !t.startsWith('region:') && t !== 'gguf'
	).slice(0, 3);

	return (
		<Box
			px="4" py="3" borderRadius="lg" cursor="pointer"
			bg={selected ? 'rgba(51, 129, 255, 0.08)' : 'rgba(255, 255, 255, 0.02)'}
			borderWidth="1px"
			borderColor={selected ? 'rgba(51, 129, 255, 0.25)' : 'rgba(255, 255, 255, 0.06)'}
			_hover={{
				borderColor: selected ? 'rgba(51, 129, 255, 0.3)' : 'rgba(255, 255, 255, 0.1)',
				bg: selected ? 'rgba(51, 129, 255, 0.1)' : 'rgba(255, 255, 255, 0.03)',
			}}
			onClick={onClick}
			transition="all 0.15s ease"
		>
			<VStack align="stretch" gap="2">
				<Box>
					<Text fontSize="11px" color="rgba(255, 255, 255, 0.3)" mb="0.5">
						{model.author}
					</Text>
					<Text fontSize="13px" fontWeight="600" color="#e4e4e7" lineClamp={1}>
						{model.modelId}
					</Text>
				</Box>

				<HStack gap="3">
					<HStack gap="1" color="rgba(255, 255, 255, 0.35)">
						<Download size={11} />
						<Text fontSize="11px" fontFamily='"Geist Mono", monospace'>
							{formatCount(model.downloads)}
						</Text>
					</HStack>
					<HStack gap="1" color="rgba(255, 255, 255, 0.35)">
						<Heart size={11} />
						<Text fontSize="11px" fontFamily='"Geist Mono", monospace'>
							{formatCount(model.likes)}
						</Text>
					</HStack>
					<HStack gap="1" color="rgba(255, 255, 255, 0.25)">
						<Clock size={11} />
						<Text fontSize="11px">{formatDate(model.lastModified)}</Text>
					</HStack>
				</HStack>

				{topTags.length > 0 && (
					<HStack gap="1" flexWrap="wrap">
						{topTags.map((tag: string) => (
							<Badge
								key={tag} px="1.5" py="0" borderRadius="sm" fontSize="10px"
								bg="rgba(255, 255, 255, 0.04)" color="rgba(255, 255, 255, 0.4)"
								borderWidth="1px" borderColor="rgba(255, 255, 255, 0.06)"
							>
								{tag}
							</Badge>
						))}
					</HStack>
				)}
			</VStack>
		</Box>
	);
}
