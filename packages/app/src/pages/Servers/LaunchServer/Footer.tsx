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
		<Flex px="6" py="4" justify="space-between" align="center" borderTopWidth="1px" borderColor="var(--w-servers-launch-footer-border)" bg="var(--w-servers-launch-footer-bg)">
			<HStack gap="4">
				<Switch.Root label="Auto-launch at startup" checked={autoLaunch} onCheckedChange={(d) => onAutoLaunchChange(d.checked)} color={autoLaunch ? 'var(--w-servers-launch-switch-active-blue)' : 'var(--w-servers-launch-switch-inactive)'}>
					<Switch.HiddenInput />
					<Switch.Control css={{ bg: autoLaunch ? 'var(--w-servers-launch-switch-active-blue)' : 'surface.4' }}>
						<Switch.Thumb css={{ bg: 'var(--w-servers-launch-switch-thumb)' }} />
					</Switch.Control>
					<Switch.Label ml="2" fontSize="13px" color={autoLaunch ? 'var(--w-servers-launch-switch-active-blue)' : 'var(--w-servers-launch-switch-inactive)'} userSelect="none">Auto-launch at startup</Switch.Label>
				</Switch.Root>
				<Switch.Root label="Auto-load latest checkpoint on start" checked={autoLoadCheckpoint} onCheckedChange={(d) => onAutoLoadCheckpointChange(d.checked)} color={autoLoadCheckpoint ? 'var(--w-servers-launch-switch-active-blue)' : 'var(--w-servers-launch-switch-inactive)'}>
					<Switch.HiddenInput />
					<Switch.Control css={{ bg: autoLoadCheckpoint ? 'var(--w-servers-launch-switch-active-blue)' : 'surface.4' }}>
						<Switch.Thumb css={{ bg: 'var(--w-servers-launch-switch-thumb)' }} />
					</Switch.Control>
					<Switch.Label ml="2" fontSize="13px" color={autoLoadCheckpoint ? 'var(--w-servers-launch-switch-active-blue)' : 'var(--w-servers-launch-switch-inactive)'} userSelect="none">Auto-load latest checkpoint on start</Switch.Label>
				</Switch.Root>
				<Switch.Root label="Auto-save checkpoint on stop" checked={autoSaveCheckpoint} onCheckedChange={(d) => onAutoSaveCheckpointChange(d.checked)} color={autoSaveCheckpoint ? 'var(--w-servers-launch-switch-active-blue)' : 'var(--w-servers-launch-switch-inactive)'}>
					<Switch.HiddenInput />
					<Switch.Control css={{ bg: autoSaveCheckpoint ? 'var(--w-servers-launch-switch-active-blue)' : 'surface.4' }}>
						<Switch.Thumb css={{ bg: 'var(--w-servers-launch-switch-thumb)' }} />
					</Switch.Control>
					<Switch.Label ml="2" fontSize="13px" color={autoSaveCheckpoint ? 'var(--w-servers-launch-switch-active-blue)' : 'var(--w-servers-launch-switch-inactive)'} userSelect="none">Auto-save all slots on stop</Switch.Label>
				</Switch.Root>
			</HStack>
			<HStack gap="2">
				<Button size="sm" variant="ghost" color="var(--w-servers-launch-cancel-btn)" _hover={{ color: 'var(--w-servers-launch-cancel-hover)', bg: 'var(--w-servers-launch-cancel-hoverbg)' }} borderRadius="lg" fontSize="13px" onClick={onCancel}>Cancel</Button>
				{isEdit ? (
					<>
						<Button size="sm" disabled={!canLaunch || launching}
							bg="var(--w-servers-launch-footer-save-bg)" color="var(--w-servers-launch-footer-save-color)" borderWidth="1px" borderColor="var(--w-servers-launch-footer-save-border)"
							_hover={{ bg: 'var(--w-servers-launch-footer-save-hoverbg)', borderColor: 'var(--w-servers-launch-footer-save-hoverborder)' }}
							_disabled={{ opacity: 0.3, cursor: 'not-allowed' }} borderRadius="lg" fontSize="13px" fontWeight="600" px="5"
							onClick={onSave}>Save</Button>
						<Button size="sm" disabled={!canLaunch || launching}
							bgGradient="to-r" gradientFrom="var(--w-servers-launch-footer-relaunch-from)" gradientTo="var(--w-servers-launch-footer-relaunch-to)" color="var(--w-servers-launch-footer-relaunch-color)"
							borderWidth="1px" borderColor="var(--w-servers-launch-footer-relaunch-border)"
							_hover={{ opacity: 0.9, shadow: '0 4px 20px var(--w-servers-launch-footer-relaunch-shadow)' }}
							_disabled={{ opacity: 0.3, cursor: 'not-allowed' }} borderRadius="lg" fontSize="13px" fontWeight="600" px="6"
							transition="all 0.2s ease" onClick={onLaunch}>
							{launching ? <Spinner size="xs" /> : <RefreshCw size={14} />}
							Relaunch with Changes
						</Button>
					</>
				) : (
					<Button size="sm" disabled={!canLaunch || launching}
						bgGradient="to-r" gradientFrom="var(--w-servers-launch-footer-launch-from)" gradientTo="var(--w-servers-launch-footer-launch-to)" color="white"
						_hover={{ opacity: 0.9, shadow: '0 4px 20px var(--w-servers-launch-footer-launch-shadow)' }}
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
