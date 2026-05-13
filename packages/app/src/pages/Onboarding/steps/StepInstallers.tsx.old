import { useEffect, useState } from 'react';
import { Box, Text, Flex, Checkbox, Spinner, Badge } from '@chakra-ui/react';
import { OnboardingHeader } from '../components/OnboardingHeader';
import { OnboardingFooter } from '../components/OnboardingFooter';
import type { IStepProps } from '../OnboardingPage';
import { useStore } from '@/store';
import { fetchHardware, fetchLlamaReleases, fetchWhisperReleases, fetchKokoroStatus, installBackend, installWhisperBackend, installKokoro } from '@/api/services';
import type { IBackendAsset } from '@warpcore/shared';
function formatSize(bytes: number): string {
	if (bytes <= 0) return '';
	const mb = bytes / (1024 * 1024);
	if (mb < 1024) return `${mb.toFixed(0)} MB`;
	return `${(mb / 1024).toFixed(1)} GB`;
}
function assetLabel(asset: IBackendAsset): string {
	const parts: string[] = [];
	parts.push(asset.backend.toUpperCase());
	if (asset.backendVersion) parts.push(asset.backendVersion);
	if (asset.gpuArch) parts.push(asset.gpuArch);
	if (asset.source === 'lemonade') parts.push('(lemonade)');
	return parts.join(' ');
}
export function StepInstallers({ goNext, goPrev, finishOnboarding }: IStepProps) {
	const hardware = useStore(s => s.hardware);
	const llamaReleases = useStore(s => s.llamaReleases);
	const whisperReleases = useStore(s => s.whisperReleases);
	const kokoroStatus = useStore(s => s.kokoroStatus);
	const setState = useStore.setState;
	const [loading, setLoading] = useState(true);
	const [installing, setInstalling] = useState(false);
	const [selectedLlama, setSelectedLlama] = useState<Record<string, boolean>>({});
	const [selectedWhisper, setSelectedWhisper] = useState<Record<string, boolean>>({});
	const [selectedKokoro, setSelectedKokoro] = useState(false);
	useEffect(() => {
		let cancelled = false;
		(async () => {
			const [hw, llama, whisper, kokoro] = await Promise.all([
				fetchHardware(),
				fetchLlamaReleases(),
				fetchWhisperReleases(),
				fetchKokoroStatus(),
			]);
			if (cancelled) return;
			setState(state => {
				if (hw.ok && hw.data) state.hardware = hw.data;
				if (llama.ok && llama.data) {
					const next: Record<string, IBackendAsset> = {};
					for (const a of llama.data) next[a.key] = a;
					state.llamaReleases = next;
				}
				if (whisper.ok && whisper.data) {
					const next: Record<string, IBackendAsset> = {};
					for (const a of whisper.data) next[a.key] = a;
					state.whisperReleases = next;
				}
				if (kokoro.ok && kokoro.data) state.kokoroStatus = kokoro.data;
			});
			setLoading(false);
		})();
		return () => { cancelled = true; };
	}, [setState]);
	const currentOs = hardware?.os;
	const llamaFiltered = Object.values(llamaReleases).filter(a => !currentOs || a.os === currentOs);
	const whisperFiltered = Object.values(whisperReleases).filter(a => !currentOs || a.os === currentOs);
	const handleInstall = async () => {
		setInstalling(true);
		try {
			const llamaKeys = Object.entries(selectedLlama).filter(([, v]) => v).map(([k]) => k);
			const whisperKeys = Object.entries(selectedWhisper).filter(([, v]) => v).map(([k]) => k);
			for (const key of llamaKeys) await installBackend(key);
			for (const key of whisperKeys) await installWhisperBackend(key);
			if (selectedKokoro) await installKokoro();
			goNext();
		} catch {
			setInstalling(false);
		}
	};
	const anySelected = Object.values(selectedLlama).some(Boolean)
		|| Object.values(selectedWhisper).some(Boolean)
		|| selectedKokoro;
	return (
		<Box display="flex" flexDirection="column" h="100%">
			<Box px="4" pt="8">
				<OnboardingHeader title="Installers" step={2} totalSteps={5} />
			</Box>
			<Box flex="1" overflowY="auto" px="4" py="6">
				<Box maxW="560px" mx="auto">
					{loading && (
						<Flex justify="center" align="center" py="12">
							<Spinner color="var(--wc-accent-blue)" />
							<Text ml="3" fontSize="14px" color="var(--wc-text-muted)">Detecting hardware and fetching releases…</Text>
						</Flex>
					)}
					{!loading && (
						<>
							{hardware && (
								<Box mb="6" p="4" borderRadius="lg" bg="var(--wc-bg-surface)">
									<Text fontSize="12px" color="var(--wc-text-muted)" mb="2">Detected hardware</Text>
									<Text fontSize="13px" color="var(--wc-text-primary)">
										{hardware.os} / {hardware.arch}
									</Text>
									{hardware.gpus.map((gpu, i) => (
										<Text key={i} fontSize="12px" color="var(--wc-text-secondary)" mt="1">
											{gpu.vendor} — {gpu.name}{gpu.driverVersion ? ` (driver ${gpu.driverVersion})` : ''}
										</Text>
									))}
								</Box>
							)}
							<Box mb="6">
								<Text fontSize="14px" fontWeight="600" color="var(--wc-text-heading)" mb="3">Llama.cpp backends</Text>
								{llamaFiltered.length === 0 && (
									<Text fontSize="13px" color="var(--wc-text-muted)">No releases found for {currentOs}.</Text>
								)}
								{llamaFiltered.map(asset => (
									<Flex key={asset.key} align="center" py="2" gap="3">
										<Checkbox
											isChecked={!!selectedLlama[asset.key]}
											onChange={e => setSelectedLlama(prev => ({ ...prev, [asset.key]: e.target.checked }))}
										/>
										<Text fontSize="13px" color="var(--wc-text-primary)" flex="1">{assetLabel(asset)}</Text>
										<Badge>{asset.llamaBuild}</Badge>
										<Text fontSize="12px" color="var(--wc-text-muted)">{formatSize(asset.size)}</Text>
									</Flex>
								))}
							</Box>
							<Box mb="6">
								<Text fontSize="14px" fontWeight="600" color="var(--wc-text-heading)" mb="3">Whisper.cpp backends</Text>
								{whisperFiltered.length === 0 && (
									<Text fontSize="13px" color="var(--wc-text-muted)">No releases found for {currentOs}.</Text>
								)}
								{whisperFiltered.map(asset => (
									<Flex key={asset.key} align="center" py="2" gap="3">
										<Checkbox
											isChecked={!!selectedWhisper[asset.key]}
											onChange={e => setSelectedWhisper(prev => ({ ...prev, [asset.key]: e.target.checked }))}
										/>
										<Text fontSize="13px" color="var(--wc-text-primary)" flex="1">{assetLabel(asset)}</Text>
										<Badge>{asset.llamaBuild}</Badge>
										<Text fontSize="12px" color="var(--wc-text-muted)">{formatSize(asset.size)}</Text>
									</Flex>
								))}
							</Box>
							<Box mb="6">
								<Text fontSize="14px" fontWeight="600" color="var(--wc-text-heading)" mb="3">Voice</Text>
								<Flex align="center" py="2" gap="3">
									<Checkbox
										isChecked={selectedKokoro}
										onChange={e => setSelectedKokoro(e.target.checked)}
										isDisabled={kokoroStatus?.installed}
									/>
									<Text fontSize="13px" color="var(--wc-text-primary)" flex="1">
										Kokoro TTS (~90 MB)
									</Text>
									{kokoroStatus?.installed && <Badge colorScheme="green">installed</Badge>}
								</Flex>
							</Box>
						</>
					)}
				</Box>
			</Box>
			<OnboardingFooter
				onBack={goPrev}
				onNext={handleInstall}
				nextLabel={installing ? 'Starting…' : anySelected ? 'Install & continue' : 'Skip'}
			/>
		</Box>
	);
}
