import { useState, useCallback } from 'react';
import {
	Box, Text, HStack, VStack, Flex, Badge, IconButton,
	Collapsible,
} from '@chakra-ui/react';
import { Key, Plus, Pencil, Trash2, ChevronDown, ChevronRight, Shield, Cpu, Wrench } from 'lucide-react';
import type { IAccessTokenInfo } from '@warpcore/shared';
import { useListQuery, useMutation } from '../../hooks/useQuery';
import { fetchTokens, deleteToken } from '../../api/services';
import { ConfirmDialog } from '../../components/dialogs/ConfirmDialog';
import { TokenDialog } from './TokenDialog';

function RoleBadge({ token }: { token: IAccessTokenInfo }) {
	if (token.admin) {
		return (
			<Badge
				size="sm"
				px="2"
				py="0.5"
				borderRadius="md"
				bg="var(--wc-accent-red-bg-8)"
				color="var(--wc-accent-red)"
				fontSize="11px"
				fontWeight="600"
			>
				<HStack gap="1">
					<Shield size={11} />
					<Text>Admin</Text>
				</HStack>
			</Badge>
		);
	}

	const hasInference = token.inference === true || (Array.isArray(token.inference) && token.inference.length > 0);
	const hasMcpLabelled = token.mcp_labelled === true || (Array.isArray(token.mcp_labelled) && token.mcp_labelled.length > 0);
	const hasMcpInline = token.mcp_inline === true || (Array.isArray(token.mcp_inline) && token.mcp_inline.length > 0);

	return (
		<HStack gap="1.5">
			{hasInference && (
				<Badge
					size="sm"
					px="2"
					py="0.5"
					borderRadius="md"
					bg="var(--wc-accent-blue-bg-12)"
					color="var(--wc-accent-blue-hover)"
					fontSize="11px"
					fontWeight="600"
				>
					<HStack gap="1">
						<Cpu size={11} />
						<Text>Inference</Text>
					</HStack>
				</Badge>
			)}
			{hasMcpLabelled && (
				<Badge
					size="sm"
					px="2"
					py="0.5"
					borderRadius="md"
					bg="var(--wc-accent-purple-bg-8)"
					color="var(--wc-accent-purple)"
					fontSize="11px"
					fontWeight="600"
				>
					<HStack gap="1">
						<Wrench size={11} />
						<Text>MCP (L)</Text>
					</HStack>
				</Badge>
			)}
			{hasMcpInline && (
				<Badge
					size="sm"
					px="2"
					py="0.5"
					borderRadius="md"
					bg="var(--wc-accent-purple-bg-8)"
					color="var(--wc-accent-purple)"
					fontSize="11px"
					fontWeight="600"
				>
					<HStack gap="1">
						<Wrench size={11} />
						<Text>MCP (I)</Text>
					</HStack>
				</Badge>
			)}
		</HStack>
	);
}

function ScopePills({ value }: { value: true | string[] }) {
	if (value === true) {
		return (
			<Text fontSize="11px" color="var(--wc-text-muted)" fontStyle="italic">
				All
			</Text>
		);
	}
	if (!Array.isArray(value) || value.length === 0) return null;

	return (
		<HStack gap="1" flexWrap="wrap">
			{value.map((v) => (
				<Badge
					key={v}
					size="sm"
					px="1.5"
					py="0"
					borderRadius="sm"
					bg="var(--wc-bg-hover)"
					color="var(--wc-text-tertiary)"
					fontSize="10px"
					fontWeight="500"
					fontFamily="mono"
				>
					{v}
				</Badge>
			))}
		</HStack>
	);
}

function formatDate(ts: number): string {
	return new Date(ts).toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
	});
}

export function AccessTokensSection() {
	const [expanded, setExpanded] = useState(true);
	const [dialogOpen, setDialogOpen] = useState(false);
	const [editingToken, setEditingToken] = useState<IAccessTokenInfo | null>(null);
	const [deleteTarget, setDeleteTarget] = useState<IAccessTokenInfo | null>(null);

	const fetcher = useCallback(() => fetchTokens(), []);
	const { data: tokens, refetch } = useListQuery<IAccessTokenInfo>(fetcher, { deepCompare: true });
	const deleteMutation = useMutation(deleteToken);

	const handleCreate = () => {
		setEditingToken(null);
		setDialogOpen(true);
	};

	const handleEdit = (token: IAccessTokenInfo) => {
		setEditingToken(token);
		setDialogOpen(true);
	};

	const handleDialogClose = () => {
		setDialogOpen(false);
		setEditingToken(null);
		refetch();
	};

	const handleDelete = async () => {
		if (!deleteTarget) return;
		await deleteMutation.mutate(deleteTarget.id);
		setDeleteTarget(null);
		refetch();
	};

	return (
		<Box
			borderWidth="1px"
			borderColor="var(--wc-border-subtle)"
			borderRadius="xl"
			bg="var(--wc-bg-subtle)"
			overflow="hidden"
		>
			{/* Header */}
			<Flex
				px="4"
				py="3"
				align="center"
				justify="space-between"
				cursor="pointer"
				onClick={() => setExpanded(!expanded)}
				_hover={{ bg: 'var(--wc-bg-surface)' }}
				transition="background 0.15s ease"
				mb="2"
			>
				<HStack gap="3">
					<Box color="var(--wc-text-muted)">
						{expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
					</Box>
					<Key size={16} color="var(--wc-text-tertiary)" />
					<Text fontSize="13px" fontWeight="600" color="var(--wc-text-primary)">
						Access Tokens
					</Text>
					<Badge
						size="sm"
						px="1.5"
						borderRadius="full"
						bg="var(--wc-bg-hover)"
						color="var(--wc-text-muted)"
						fontSize="10px"
						fontWeight="600"
					>
						{tokens.length}
					</Badge>
				</HStack>
				<IconButton
					aria-label="Create token"
					size="xs"
					variant="ghost"
					color="var(--wc-text-tertiary)"
					_hover={{ bg: 'var(--wc-accent-blue-bg-12)', color: 'var(--wc-accent-blue-hover)' }}
					onClick={(e) => {
						e.stopPropagation();
						handleCreate();
					}}
				>
					<Plus size={15} />
				</IconButton>
			</Flex>

			{/* Collapsible content */}
			<Collapsible.Root open={expanded}>
				<Collapsible.Content>
					<Box px="4" pb="3">
						{tokens.length === 0 ? (
							<Flex
								py="6"
								align="center"
								justify="center"
								direction="column"
								gap="2"
							>
								<Key size={20} color="var(--wc-text-disabled)" />
								<Text fontSize="12px" color="var(--wc-text-faint)">
									No access tokens created yet
								</Text>
								<Text fontSize="11px" color="var(--wc-text-placeholder)">
									Tokens are required when authentication is enabled for remote access
								</Text>
							</Flex>
						) : (
							<VStack gap="1" align="stretch">
								{/* Table header */}
								<HStack
									px="3"
									py="1.5"
									gap="3"
									borderBottomWidth="1px"
									borderColor="var(--wc-border-subtle)"
								>
									<Text flex="1.2" fontSize="10px" fontWeight="600" color="var(--wc-text-muted)" textTransform="uppercase" letterSpacing="0.05em">
										Name
									</Text>
									<Text flex="0.8" fontSize="10px" fontWeight="600" color="var(--wc-text-muted)" textTransform="uppercase" letterSpacing="0.05em">
										Token
									</Text>
									<Text flex="1" fontSize="10px" fontWeight="600" color="var(--wc-text-muted)" textTransform="uppercase" letterSpacing="0.05em">
										Role
									</Text>
									<Text flex="1.5" fontSize="10px" fontWeight="600" color="var(--wc-text-muted)" textTransform="uppercase" letterSpacing="0.05em">
										Scope
									</Text>
									<Text flex="0.6" fontSize="10px" fontWeight="600" color="var(--wc-text-muted)" textTransform="uppercase" letterSpacing="0.05em">
										Created
									</Text>
									<Box w="60px" />
								</HStack>

								{/* Token rows */}
								{tokens.map((token) => (
									<HStack
										key={token.id}
										px="3"
										py="2"
										gap="3"
										borderRadius="lg"
_hover={{ bg: 'var(--wc-bg-surface)' }}
										transition="background 0.15s ease"
									>
										<Text flex="1.2" fontSize="12px" color="var(--wc-text-secondary)" fontWeight="500" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
											{token.name}
										</Text>
										<Text flex="0.8" fontSize="11px" color="var(--wc-text-faint)" fontFamily="mono">
											{token.tokenPrefix}...
										</Text>
										<Box flex="1">
											<RoleBadge token={token} />
										</Box>
										<Box flex="1.5">
											{token.admin ? (
<Text fontSize="11px" color="var(--wc-text-muted)" fontStyle="italic">
													Unrestricted
												</Text>
											) : (
												<VStack gap="0.5" align="start">
													{(token.inference === true || (Array.isArray(token.inference) && token.inference.length > 0)) && (
														<ScopePills value={token.inference} />
													)}
													{(token.mcp_labelled === true || (Array.isArray(token.mcp_labelled) && token.mcp_labelled.length > 0)) && (
														<HStack gap="1">
															<Text fontSize="9px" color="var(--wc-accent-purple-icon)" fontWeight="600">L:</Text>
															<ScopePills value={token.mcp_labelled} />
														</HStack>
													)}
													{(token.mcp_inline === true || (Array.isArray(token.mcp_inline) && token.mcp_inline.length > 0)) && (
														<HStack gap="1">
															<Text fontSize="9px" color="var(--wc-accent-purple-icon)" fontWeight="600">I:</Text>
															<ScopePills value={token.mcp_inline} />
														</HStack>
													)}
												</VStack>
											)}
										</Box>
										<Text flex="0.6" fontSize="11px" color="var(--wc-text-faint)">
											{formatDate(token.createdAt)}
										</Text>
										<HStack gap="0.5" w="60px" justify="flex-end">
											<IconButton
												aria-label="Edit token"
												size="xs"
												variant="ghost"
												color="var(--wc-text-faint)"
												_hover={{ bg: 'var(--wc-bg-hover)', color: 'var(--wc-text-secondary)' }}
												onClick={() => handleEdit(token)}
											>
												<Pencil size={13} />
											</IconButton>
											<IconButton
												aria-label="Delete token"
												size="xs"
												variant="ghost"
												color="var(--wc-text-faint)"
												_hover={{ bg: 'var(--wc-accent-red-alt-bg)', color: 'var(--wc-accent-red)' }}
												onClick={() => setDeleteTarget(token)}
											>
												<Trash2 size={13} />
											</IconButton>
										</HStack>
									</HStack>
								))}
							</VStack>
						)}
					</Box>
				</Collapsible.Content>
			</Collapsible.Root>

			{/* Create/Edit dialog */}
			{dialogOpen && (
				<TokenDialog
					open={dialogOpen}
					onClose={handleDialogClose}
					editingToken={editingToken}
				/>
			)}

			{/* Delete confirmation */}
			{deleteTarget && (
				<ConfirmDialog
					isOpen={!!deleteTarget}
					title="Revoke Token"
					message={`Revoke "${deleteTarget.name}"? Any client using this token will immediately lose access. This cannot be undone.`}
					confirmLabel="Revoke"
					onConfirm={handleDelete}
					onCancel={() => setDeleteTarget(null)}
					isLoading={deleteMutation.loading}
				/>
			)}
		</Box>
	);
}
