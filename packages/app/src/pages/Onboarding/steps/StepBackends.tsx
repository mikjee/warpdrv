import { useEffect, useState } from 'react';
import { Box, Text, Flex, Checkbox, Spinner, Badge } from '@chakra-ui/react';
import { OnboardingHeader } from '../components/OnboardingHeader';
import { OnboardingFooter } from '../components/OnboardingFooter';
import type { IStepProps } from '../OnboardingPage';
import { fetchHardware, fetchLlamaReleases, fetchWhisperReleases, fetchKokoroStatus, installBackend, installWhisperBackend, installKokoro } from '@/api/services';
import { useStore } from '@/store';
import type { IBackendAsset, IHardwareInfo, IKokoroStatus } from '@warpcore/shared';
function formatSize(bytes: number): string {
	if (bytes === 0) return '';
	const mb = bytes / (1024 * 1024);
	if (mb < 1024) return `${mb.toFixed(0)} MB`;
	return `${(mb / 1024).toFixed(1)} GB`;
}
function assetLabel(asset: IBackendAsset): string {
	const parts = [asset.backend.toUpperCase()];
	if (asset.backendVersion) parts.push(asset.backendVersion);
	if (asset.gpuArch) parts.push(asset.gpuArch);
	if (asset.source === 'lemonade') parts.push('(lemonade)');
	return parts.join(' ');
}
export function StepBackends({ goNext, goPrev }: IStepProps) {
	const [loading, setLoading] = useState<boolean>(true);
	const [hardware, setHardware] = useState<IHardwareInfo | null>(null);
	const [llamaAssets, setLlamaAssets] = useState<IBackendAsset[]>([]);
	const [whisperAssets, setWhisperAssets] = useState<IBackendAsset[]>([]);
	const [kokoroStatus, setKokoroStatus] = useState<IKokoroStatus | null>(null);
	const [selectedLlama, setSelectedLlama] = useState<Record<string, boolean>>({});
	const [selectedWhisper, setSelectedWhisper] = useState<Record<string, boolean>>({});
	const [installKokoroSelected, setInstallKokoroSelected] = useState<boolean>(false);
	const [installing, setInstalling] = useState<boolean>(false);
	useEffect(() => {
		const load = async () => {
			setLoading(true);
			const [hw, llama, whisper, kokoro] = await Promise.all([
				fetchHardware(),
				fetchLlamaReleases(),
				fetchWhisperReleases(),
				fetchKokoroStatus(),
			]);
			if (hw.ok && hw.data) {
				setHardware(hw.data);
				const llamaForOs = (llama.ok ? llama.data : []).filter(a => a.os === hw.data!.os);
				const whisperForOs = (whisper.ok ? whisper.data : []).filter(a => a.os === hw.data!.os);
				setLlamaAssets(llamaForOs);
				setWhisperAssets(whisperForOs);
				const cpu = llamaForOs.find(a => a.backend === 'cpu');
				if (cpu) setSelectedLlama({ [cpu.key]: true });
			}
			if (kokoro.ok && kokoro.data) setKokoroStatus(kokoro.data);
			setLoading(false);
		};
		load();
	}, []);
	const handleNext = async () => {
		setInstalling(true);
		try {
			for (const key of Object.keys(selectedLlama)) {
				if (selectedLlama[key]) await installBackend(key);
			}
			for (const key of Object.keys(selectedWhisper)) {
				if (selectedWhisper[key]) await installWhisperBackend(key);
			}
			if (installKokoroSelected && kokoroStatus && !kokoroStatus.installed) {
				await installKokoro();
			}
			goNext();
		} catch (err) {
			console.error('[StepBackends] Install error:', err);
			setInstalling(false);
		}
	};
	const anySelected = Object.values(selectedLlama).some(v => v) || Object.values(selectedWhisper).some(v => v) || installKokoroSelected;
	return (
		<Box display="flex" flexDirection="column" h="100%">
			<Box px="4" pt="8">
				<OnboardingHeader title="Backends" step={1} totalSteps={5} />
			</Box>
			<Box flex="1" overflowY="auto" px="4" py="6">
				<Box maxW="560px" mx="auto">
					{loading && (
						<Flex justify="center" align="center" py="12">
							<Spinner color="var(--wc-text-muted)" />
						</Flex>
					)}
					{!loading && hardware && (
						<>
							<Box mb="6">
								<Text fontSize="13px" color="var(--wc-text-muted)" mb="2">Detected hardware</Text>
								<Text fontSize="14px" color="var(--wc-text-primary)">
									{hardware.os} · {hardware.arch}
								</Text>
								{hardware.gpus.length > 0 && (
									<Box mt="2">
										{hardware.gpus.map((gpu, i) => (
											<Text key={i} fontSize="13px" color="var(--wc-text-secondary)">
												{gpu.vendor} — {gpu.name}
											</Text>
										))}
									</Box>
								)}
							</Box>
							<Box mb="6">
								<Text fontSize="14px" fontWeight="600" color="var(--wc-text-heading)" mb="3">llama.cpp backends</Text>
								{llamaAssets.length === 0 && <Text fontSize="13px" color="var(--wc-text-muted)">No releases available for this OS.</Text>}
								{llamaAssets.map(asset => (
									<Flex key={asset.key} align="center" py="2" gap="3">
										<Checkbox.Root
											checked={!!selectedLlama[asset.key]}
											onCheckedChange={(e) => setSelectedLlama(prev => ({ ...prev, [asset.key]: e.checked }))}
										>
											<Checkbox.HiddenInput />
											<Checkbox.Control />
											<Checkbox.Label>
												<Text fontSize="14px" color="var(--wc-text-primary)">{assetLabel(asset)}</Text>
											</Checkbox.Label>
										</Checkbox.Root>
										<Badge fontSize="11px">{formatSize(asset.size)}</Badge>
									</Flex>
								))}
							</Box>
							<Box mb="6">
								<Text fontSize="14px" fontWeight="600" color="var(--wc-text-heading)" mb="3">whisper.cpp backends</Text>
								{whisperAssets.length === 0 && <Text fontSize="13px" color="var(--wc-text-muted)">No releases available for this OS.</Text>}
								{whisperAssets.map(asset => (
									<Flex key={asset.key} align="center" py="2" gap="3">
										<Checkbox.Root
											checked={!!selectedWhisper[asset.key]}
											onCheckedChange={(e) => setSelectedWhisper(prev => ({ ...prev, [asset.key]: e.checked }))}
										>
											<Checkbox.HiddenInput />
											<Checkbox.Control />
											<Checkbox.Label>
												<Text fontSize="14px" color="var(--wc-text-primary)">{assetLabel(asset)}</Text>
											</Checkbox.Label>
										</Checkbox.Root>
										<Badge fontSize="11px">{formatSize(asset.size)}</Badge>
									</Flex>
								))}
							</Box>
							<Box mb="6">
								<Text fontSize="14px" fontWeight="600" color="var(--wc-text-heading)" mb="3">Voice (optional)</Text>
								{kokoroStatus?.installed ? (
									<Text fontSize="13px" color="var(--wc-text-muted)">Kokoro TTS already installed.</Text>
								) : (
									<Flex align="center" py="2" gap="3">
										<Checkbox.Root
											checked={installKokoroSelected}
											onCheckedChange={(e) => setInstallKokoroSelected(e.checked)}
										>
											<Checkbox.HiddenInput />
											<Checkbox.Control />
											<Checkbox.Label>
												<Text fontSize="14px" color="var(--wc-text-primary)">Kokoro TTS</Text>
											</Checkbox.Label>
										</Checkbox.Root>
										<Badge fontSize="11px">~90 MB</Badge>
									</Flex>
								)}
							</Box>
						</>
					)}
				</Box>
			</Box>
			<OnboardingFooter
				onBack={goPrev}
				onNext={handleNext}
				nextLabel={installing ? 'Starting installs…' : (anySelected ? 'Install & continue' : 'Skip')}
			/>
		</Box>
	);
}
