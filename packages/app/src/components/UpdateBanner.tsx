import { useState, useEffect } from 'react';
import { Box, Text, HStack, Flex, Button } from '@chakra-ui/react';
import { ArrowUpCircle, X, ExternalLink } from 'lucide-react';
import { openExternal } from '../utils/openExternal';

interface IUpdateInfo {
	currentVersion: string;
	latestVersion: string;
	updateAvailable: boolean;
	downloadUrl: string;
	notes: string;
}

export function UpdateBanner() {
	const [update, setUpdate] = useState<IUpdateInfo | null>(null);
	const [dismissed, setDismissed] = useState(false);

	useEffect(() => {
		// Check once on mount, then every 6 hours
		checkForUpdate();
		const interval = setInterval(checkForUpdate, 6 * 60 * 60 * 1000);
		return () => clearInterval(interval);
	}, []);

	async function checkForUpdate() {
		try {
			const res = await fetch('/api/update/check');
			const json = await res.json();
			if (json.ok && json.data?.updateAvailable) {
				setUpdate(json.data);
			}
		} catch {
			// Silent fail
		}
	}

	if (!update || dismissed) return null;

	return (
		<Flex
			px="4" py="2.5"
			bg="rgba(51, 129, 255, 0.06)"
			borderBottomWidth="1px" borderColor="rgba(51, 129, 255, 0.15)"
			align="center" justify="space-between"
		>
			<HStack gap="3">
				<ArrowUpCircle size={16} color="#3381ff" />
				<Text fontSize="12px" color="rgba(255, 255, 255, 0.6)">
					WarpCore <Text as="span" fontWeight="600" color="#3381ff">v{update.latestVersion}</Text> is available
					{update.notes && (
						<Text as="span" color="rgba(255, 255, 255, 0.35)"> — {update.notes}</Text>
					)}
				</Text>
			</HStack>
			<HStack gap="2">
				<Button
					size="xs" px="3" borderRadius="lg" fontSize="11px" fontWeight="500"
					bg="rgba(51, 129, 255, 0.12)" color="#3381ff"
					borderWidth="1px" borderColor="rgba(51, 129, 255, 0.25)"
					_hover={{ bg: 'rgba(51, 129, 255, 0.2)' }}
					onClick={() => openExternal(update.downloadUrl)}
				>
					<ExternalLink size={11} /> Download
				</Button>
				<Button
					size="xs" variant="ghost" color="rgba(255, 255, 255, 0.25)"
					_hover={{ color: 'rgba(255, 255, 255, 0.5)', bg: 'rgba(255, 255, 255, 0.04)' }}
					borderRadius="md" minW="6" px="0"
					onClick={() => setDismissed(true)}
				>
					<X size={12} />
				</Button>
			</HStack>
		</Flex>
	);
}
