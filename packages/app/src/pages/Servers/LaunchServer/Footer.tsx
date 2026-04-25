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
		<Flex px="6" py="4" justify="space-between" align="center" borderTopWidth="1px" borderColor="rgba(255, 255, 255, 0.06)" bg="rgba(255, 255, 255, 0.01)">
			<HStack gap="4">
				<Switch.Root label="Auto-launch at startup" checked={autoLaunch} onCheckedChange={(d) => onAutoLaunchChange(d.checked)} color={autoLaunch ? '#3b86d6' : 'rgba(255, 255, 255, 0.4)'}>
					<Switch.HiddenInput />
					<Switch.Control css={{ bg: autoLaunch ? '#3b86d6' : 'surface.4' }}>
						<Switch.Thumb css={{ bg: 'rgba(25, 25, 25)' }} />
					</Switch.Control>
					<Switch.Label ml="2" fontSize="13px" color={autoLaunch ? '#3b86d6' : 'rgba(255, 255, 255, 0.4)'} userSelect="none">Auto-launch at startup</Switch.Label>
				</Switch.Root>
				<Switch.Root label="Auto-load latest checkpoint on start" checked={autoLoadCheckpoint} onCheckedChange={(d) => onAutoLoadCheckpointChange(d.checked)} color={autoLoadCheckpoint ? '#3b86d6' : 'rgba(255, 255, 255, 0.4)'}>
					<Switch.HiddenInput />
					<Switch.Control css={{ bg: autoLoadCheckpoint ? '#3b86d6' : 'surface.4' }}>
						<Switch.Thumb css={{ bg: 'rgba(25, 25, 25)' }} />
					</Switch.Control>
					<Switch.Label ml="2" fontSize="13px" color={autoLoadCheckpoint ? '#3b86d6' : 'rgba(255, 255, 255, 0.4)'} userSelect="none">Auto-load latest checkpoint on start</Switch.Label>
				</Switch.Root>
				<Switch.Root label="Auto-save checkpoint on stop" checked={autoSaveCheckpoint} onCheckedChange={(d) => onAutoSaveCheckpointChange(d.checked)} color={autoSaveCheckpoint ? '#3b86d6' : 'rgba(255, 255, 255, 0.4)'}>
					<Switch.HiddenInput />
					<Switch.Control css={{ bg: autoSaveCheckpoint ? '#3b86d6' : 'surface.4' }}>
						<Switch.Thumb css={{ bg: 'rgba(25, 25, 25)' }} />
					</Switch.Control>
					<Switch.Label ml="2" fontSize="13px" color={autoSaveCheckpoint ? '#3b86d6' : 'rgba(255, 255, 255, 0.4)'} userSelect="none">Auto-save all slots on stop</Switch.Label>
				</Switch.Root>
			</HStack>
			<HStack gap="2">
				<Button size="sm" variant="ghost" color="rgba(255, 255, 255, 0.4)" _hover={{ color: '#e4e4e7', bg: 'rgba(255, 255, 255, 0.06)' }} borderRadius="lg" fontSize="13px" onClick={onCancel}>Cancel</Button>
				{isEdit ? (
					<>
						<Button size="sm" disabled={!canLaunch || launching}
							bg="rgba(255, 255, 255, 0.08)" color="#e4e4e7" borderWidth="1px" borderColor="rgba(255, 255, 255, 0.15)"
							_hover={{ bg: 'rgba(255, 255, 255, 0.12)', borderColor: 'rgba(255, 255, 255, 0.25)' }}
							_disabled={{ opacity: 0.3, cursor: 'not-allowed' }} borderRadius="lg" fontSize="13px" fontWeight="600" px="5"
							onClick={onSave}>Save</Button>
						<Button size="sm" disabled={!canLaunch || launching}
							bgGradient="to-r" gradientFrom="#fbbf24" gradientTo="#f59e0b" color="#18181b"
							borderWidth="1px" borderColor="rgba(251, 191, 36, 0.3)"
							_hover={{ opacity: 0.9, shadow: '0 4px 20px rgba(251, 191, 36, 0.3)' }}
							_disabled={{ opacity: 0.3, cursor: 'not-allowed' }} borderRadius="lg" fontSize="13px" fontWeight="600" px="6"
							transition="all 0.2s ease" onClick={onLaunch}>
							{launching ? <Spinner size="xs" /> : <RefreshCw size={14} />}
							Relaunch with Changes
						</Button>
					</>
				) : (
					<Button size="sm" disabled={!canLaunch || launching}
						bgGradient="to-r" gradientFrom="#3381ff" gradientTo="#5b6af5" color="white"
						_hover={{ opacity: 0.9, shadow: '0 4px 20px rgba(51, 129, 255, 0.3)' }}
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
