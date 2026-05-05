import React from 'react';
import { Flex, HStack, Button, Spinner, Switch } from '@chakra-ui/react';
import { Play, RefreshCw } from 'lucide-react';

export const Footer = React.memo(({
	isEdit,
	autoLaunch, onAutoLaunchChange,
	autoLoadCheckpoint, onAutoLoadCheckpointChange,
	autoSaveCheckpoint, onAutoSaveCheckpointChange,
	canLaunch, launching,
	onCancel, onSave, onLaunch,
}: {
	isEdit: boolean;
	autoLaunch: boolean; onAutoLaunchChange: (v: boolean) => void;
	autoLoadCheckpoint: boolean; onAutoLoadCheckpointChange: (v: boolean) => void;
	autoSaveCheckpoint: boolean; onAutoSaveCheckpointChange: (v: boolean) => void;
	canLaunch: boolean; launching: boolean;
	onCancel: () => void; onSave: () => void; onLaunch: () => void;
}) => {
	return (
		<Flex px="6" py="4" justify="space-between" align="center" borderTopWidth="1px" borderColor="var(--wc-border-subtle)" bg="var(--wc-bg-surface)">
			<HStack gap="4">
<Switch.Root label="Auto-launch at startup" checked={autoLaunch} onCheckedChange={(d) => onAutoLaunchChange(d.checked)} color={autoLaunch ? 'var(--wc-accent-blue)' : 'var(--wc-text-tertiary)'}>
				<Switch.HiddenInput />
				<Switch.Control css={{ bg: autoLaunch ? 'var(--wc-accent-blue)' : 'var(--wc-bg-card)' }}>
					<Switch.Thumb css={{ bg: 'var(--wc-special-switch-thumb)' }} />
				</Switch.Control>
				<Switch.Label ml="2" fontSize="13px" color={autoLaunch ? 'var(--wc-accent-blue)' : 'var(--wc-text-tertiary)'} userSelect="none">Auto-launch at startup</Switch.Label>
				</Switch.Root>
				<Switch.Root label="Auto-load latest checkpoint on start" checked={autoLoadCheckpoint} onCheckedChange={(d) => onAutoLoadCheckpointChange(d.checked)} color={autoLoadCheckpoint ? 'var(--wc-accent-blue)' : 'var(--wc-text-tertiary)'}>
					<Switch.HiddenInput />
					<Switch.Control css={{ bg: autoLoadCheckpoint ? 'var(--wc-accent-blue)' : 'var(--wc-bg-card)' }}>
						<Switch.Thumb css={{ bg: 'var(--wc-special-switch-thumb)' }} />
					</Switch.Control>
					<Switch.Label ml="2" fontSize="13px" color={autoLoadCheckpoint ? 'var(--wc-accent-blue)' : 'var(--wc-text-tertiary)'} userSelect="none">Auto-load latest checkpoint on start</Switch.Label>
				</Switch.Root>
<Switch.Root label="Auto-save checkpoint on stop" checked={autoSaveCheckpoint} onCheckedChange={(d) => onAutoSaveCheckpointChange(d.checked)} color={autoSaveCheckpoint ? 'var(--wc-accent-blue)' : 'var(--wc-text-tertiary)'}>
				<Switch.HiddenInput />
				<Switch.Control css={{ bg: autoSaveCheckpoint ? 'var(--wc-accent-blue)' : 'var(--wc-bg-card)' }}>
					<Switch.Thumb css={{ bg: 'var(--wc-special-switch-thumb)' }} />
				</Switch.Control>
				<Switch.Label ml="2" fontSize="13px" color={autoSaveCheckpoint ? 'var(--wc-accent-blue)' : 'var(--wc-text-tertiary)'} userSelect="none">Auto-save all slots on stop</Switch.Label>
				</Switch.Root>
			</HStack>
			<HStack gap="2">
				<Button size="sm" variant="ghost" color="var(--wc-text-tertiary)" _hover={{ color: 'var(--wc-text-secondary)', bg: 'var(--wc-bg-hover)' }} borderRadius="lg" fontSize="13px" onClick={onCancel}>Cancel</Button>
				{isEdit ? (
					<>
						<Button size="sm" disabled={!canLaunch || launching}
							bg="var(--wc-bg-card)" color="var(--wc-text-primary)" borderWidth="1px" borderColor="var(--wc-border-strong)"
							_hover={{ bg: 'var(--wc-bg-selected)', borderColor: 'var(--wc-border-focus)' }}
							_disabled={{ opacity: 0.3, cursor: 'not-allowed' }} borderRadius="lg" fontSize="13px" fontWeight="600" px="5"
							onClick={onSave}>Save</Button>
						<Button size="sm" disabled={!canLaunch || launching}
bgGradient="to-r" gradientFrom="var(--wc-gradient-yellow-from)" gradientTo="var(--wc-gradient-yellow-to)" color="var(--wc-bg-elevated)"
							borderWidth="1px" borderColor="var(--wc-accent-blue-border)"
							_hover={{ opacity: 0.9, shadow: '0 4px 20px var(--wc-accent-blue-focus)' }}
							_disabled={{ opacity: 0.3, cursor: 'not-allowed' }} borderRadius="lg" fontSize="13px" fontWeight="600" px="6"
							transition="all 0.2s ease" onClick={onLaunch}>
							{launching ? <Spinner size="xs" /> : <RefreshCw size={14} />}
							Relaunch with Changes
						</Button>
					</>
				) : (
					<Button size="sm" disabled={!canLaunch || launching}
						bgGradient="to-r" gradientFrom="var(--wc-gradient-blue-from)" gradientTo="var(--wc-gradient-blue-to)" color="white"
						_hover={{ opacity: 0.9, shadow: '0 4px 20px var(--wc-accent-blue-focus)' }}
						_disabled={{ opacity: 0.3, cursor: 'not-allowed' }} borderRadius="lg" fontSize="13px" fontWeight="600" px="6"
						transition="all 0.2s ease" onClick={onLaunch}>
						{launching ? <Spinner size="xs" /> : <Play size={14} />}
						Launch
					</Button>
				)}
			</HStack>
		</Flex>
	);
});
