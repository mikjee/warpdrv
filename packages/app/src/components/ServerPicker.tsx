import { Box, Text, HStack } from '@chakra-ui/react';
import { ChevronDown, Eye } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { computePosition, flip, shift, offset } from '@floating-ui/dom';
import { useStore } from '@/store';
import { EServerStatus } from '@warpcore/shared';

export function ServerDot({ status }: { status: EServerStatus }) {
	if (status === EServerStatus.RUNNING) return <Box w="8px" h="8px" borderRadius="full" bg="var(--wc-accent-green-icon)" flexShrink={0} />;
	if (status === EServerStatus.LOADING) return <Box w="8px" h="8px" borderRadius="full" bg="var(--wc-accent-yellow-strong)" flexShrink={0} />;
	if (status === EServerStatus.ERROR) return <Box w="8px" h="8px" borderRadius="full" bg="var(--wc-accent-red)" flexShrink={0} />;
	return <Box w="8px" h="8px" borderRadius="full" bg="var(--wc-text-disabled)" flexShrink={0} />;
}

export const ServerPicker = React.memo(({ value, onChange }: { value: string; onChange: (serverId: string) => void }) => {
	const [open, setOpen] = useState(false);
	const triggerRef = useRef<HTMLDivElement | null>(null);
	const dropdownRef = useRef<HTMLDivElement | null>(null);
	const serversMap = useStore(s => s.servers);

	const servers = useMemo(() => Object.values(serversMap).sort((a, b) => {
		const aRunning = a.status === EServerStatus.RUNNING;
		const bRunning = b.status === EServerStatus.RUNNING;
		if (aRunning && !bRunning) return -1;
		if (!aRunning && bRunning) return 1;
		return 0;
	}), [serversMap]);

	const selectedServer = useMemo(() => value ? serversMap[value] : null, [value, serversMap]);

	const handleSelect = useCallback((serverId: string) => {
		onChange(serverId);
		setOpen(false);
	}, [onChange]);

	useEffect(() => {
		if (!open) return;
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') setOpen(false);
		};
		const handleClickOutside = (e: MouseEvent) => {
			if (!dropdownRef.current || !triggerRef.current) return;
			if (dropdownRef.current.contains(e.target as Node) || triggerRef.current.contains(e.target as Node)) return;
			setOpen(false);
		};
		document.addEventListener('keydown', handleKeyDown);
		document.addEventListener('mousedown', handleClickOutside);
		return () => {
			document.removeEventListener('keydown', handleKeyDown);
			document.removeEventListener('mousedown', handleClickOutside);
		};
	}, [open]);

	useEffect(() => {
		if (!open || !triggerRef.current || !dropdownRef.current) return;
		computePosition(triggerRef.current, dropdownRef.current, {
			placement: 'bottom-start',
			middleware: [offset(6), flip(), shift({ padding: 8 })],
		}).then(({ x, y }) => {
			if (!dropdownRef.current) return;
			dropdownRef.current.style.left = `${x}px`;
			dropdownRef.current.style.top = `${y}px`;
		});
	}, [open]);

	return (
		<>
			<HStack
				ref={triggerRef}
				gap="2"
				p="2.5"
				cursor="pointer"
				borderRadius="lg"
				borderWidth="1px"
				borderColor="var(--wc-border-default)"
				_hover={{ bg: 'var(--wc-bg-hover)' }}
				onClick={() => setOpen(!open)}
				fontSize="12px"
				color="var(--wc-text-primary)"
				w="100%"
			>
				{selectedServer ? (
					<>
						<ServerDot status={selectedServer.status} />
						<Text flex="1" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap" fontSize="12px">
							{selectedServer.serverName}
						</Text>
						{selectedServer.useMultiModal && <Eye size={12} color="var(--wc-special-vision-yellow)" />}
						<ChevronDown size={12} style={{ opacity: 0.4 }} />
					</>
				) : (
					<>
						<Text flex="1" color="var(--wc-text-faint)" fontSize="12px">
							Select
						</Text>
						<ChevronDown size={12} style={{ opacity: 0.4 }} />
					</>
				)}
			</HStack>
			{open && createPortal(
				<div
					ref={dropdownRef}
					style={{
						position: 'absolute',
						zIndex: 10000,
						minWidth: '160px',
						maxWidth: '220px',
						maxHeight: '200px',
						overflowY: 'auto',
						borderRadius: '8px',
						border: '1px solid var(--wc-border-overlay)',
						background: 'var(--wc-bg-elevated)',
						boxShadow: '0px 8px 24px rgba(0,0,0,0.25)',
						padding: '4px',
					}}
				>
					{servers.length === 0 && (
						<div style={{ padding: '8px 12px', fontSize: '0.75rem', color: 'var(--wc-text-faint)' }}>
							No servers
						</div>
					)}
					{servers.map((s) => (
						<div
							key={s.id}
							onClick={() => handleSelect(s.id)}
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: '8px',
								padding: '6px 8px',
								borderRadius: '6px',
								cursor: 'pointer',
								fontSize: '0.75rem',
								color: 'var(--wc-text-primary)',
								background: value === s.id ? 'var(--wc-bg-selected)' : 'transparent',
							}}
							onMouseEnter={(e) => {
								if (value !== s.id) (e.currentTarget as HTMLDivElement).style.background = 'var(--wc-bg-card)';
							}}
							onMouseLeave={(e) => {
								if (value !== s.id) (e.currentTarget as HTMLDivElement).style.background = 'transparent';
							}}
						>
							<ServerDot status={s.status} />
							<span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
								{s.serverName}
							</span>
							{s.useMultiModal && <Eye size={12} color="var(--wc-special-vision-yellow)" />}
						</div>
					))}
				</div>,
				document.body,
			)}
		</>
	);
});
