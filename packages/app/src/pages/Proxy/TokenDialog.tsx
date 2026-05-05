import { useState, useRef, useCallback } from 'react';
import {
	Box, Text, HStack, VStack, Flex, Badge, Input, IconButton,
	DialogRoot, DialogContent, DialogHeader, DialogBody, DialogFooter,
	DialogTitle, DialogCloseTrigger,
	Button,
} from '@chakra-ui/react';
import { X, Copy, Check, Shield, Cpu, Wrench, AlertTriangle } from 'lucide-react';
import type { IAccessTokenInfo, IAccessTokenCreatePayload, IAccessTokenUpdatePayload } from '@warpcore/shared';
import { useMutation } from '../../hooks/useQuery';
import { createToken, updateToken } from '../../api/services';
import { useToast } from '../../components/ToastProvider';

// ============================================================
// PillInput - text input that converts entries into removable pills
// ============================================================

function PillInput({
	values,
	onChange,
	placeholder,
	disabled,
}: {
	values: string[];
	onChange: (values: string[]) => void;
	placeholder: string;
	disabled?: boolean;
}) {
	const [inputValue, setInputValue] = useState('');
	const inputRef = useRef<HTMLInputElement>(null);

	const addValue = (val: string) => {
		const trimmed = val.trim();
		if (trimmed && !values.includes(trimmed)) {
			onChange([...values, trimmed]);
		}
		setInputValue('');
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === 'Enter' || e.key === ',' || e.key === 'Tab') {
			e.preventDefault();
			addValue(inputValue);
		}
		if (e.key === 'Backspace' && inputValue === '' && values.length > 0) {
			onChange(values.slice(0, -1));
		}
	};

	const removeValue = (idx: number) => {
		onChange(values.filter((_, i) => i !== idx));
	};

	return (
		<Box
			borderWidth="1px"
			borderColor={disabled ? 'var(--wc-bg-card)' : 'var(--wc-border-default)'}
			borderRadius="lg"
			bg={disabled ? 'var(--wc-bg-selected)' : 'var(--wc-bg-interactive)'}
			px="2"
			py="1.5"
			minH="38px"
			cursor={disabled ? 'not-allowed' : 'text'}
			opacity={disabled ? 0.4 : 1}
			onClick={() => { if (!disabled) inputRef.current?.focus(); }}
			transition="border-color 0.15s ease"
			_focusWithin={{ borderColor: 'var(--wc-accent-blue-focus)' }}
		>
			<HStack gap="1.5" flexWrap="wrap">
				{values.map((val, idx) => (
					<Badge
						key={val}
						px="2"
						py="0.5"
						borderRadius="md"
						bg="var(--wc-accent-blue-bg-12)"
						color="var(--wc-accent-blue-hover)"
						fontSize="11px"
						fontWeight="500"
						fontFamily="mono"
					>
						<HStack gap="1">
							<Text>{val}</Text>
							{!disabled && (
								<Box
									cursor="pointer"
									onClick={(e) => { e.stopPropagation(); removeValue(idx); }}
									color="var(--wc-text-tertiary)"
									_hover={{ color: 'var(--wc-accent-red)' }}
									transition="color 0.15s ease"
								>
									<X size={10} />
								</Box>
							)}
						</HStack>
					</Badge>
				))}
				{!disabled && (
					<Input
						ref={inputRef}
						value={inputValue}
						onChange={(e) => setInputValue(e.target.value)}
						onKeyDown={handleKeyDown}
						onBlur={() => { if (inputValue.trim()) addValue(inputValue); }}
						placeholder={values.length === 0 ? placeholder : ''}
						size="sm"
						flex="1"
						minW="80px"
						fontSize="12px"
						color="var(--wc-text-secondary)"
						_placeholder={{ color: 'var(--wc-text-placeholder)' }}
					/>
				)}
			</HStack>
		</Box>
	);
}

// ============================================================
// Role selector - radio-style toggle
// ============================================================

function RoleOption({
	selected,
	onClick,
	icon,
	label,
	description,
	color,
}: {
	selected: boolean;
	onClick: () => void;
	icon: React.ReactNode;
	label: string;
	description: string;
	color: string;
}) {
	return (
		<Box
			flex="1"
			px="3"
			py="2.5"
			borderWidth="1px"
			borderColor={selected ? `color-mix(in srgb, ${color} 25%, transparent)` : 'var(--wc-border-subtle)'}
			borderRadius="lg"
			bg={selected ? `color-mix(in srgb, ${color} 5%, transparent)` : 'transparent'}
			cursor="pointer"
			onClick={onClick}
			transition="all 0.15s ease"
			_hover={{ borderColor: selected ? `color-mix(in srgb, ${color} 25%, transparent)` : 'var(--wc-border-hover)' }}
		>
			<HStack gap="2.5">
				<Box color={selected ? color : 'var(--wc-text-faint)'}>
					{icon}
				</Box>
				<VStack gap="0" align="start">
					<Text fontSize="12px" fontWeight="600" color={selected ? 'var(--wc-text-heading)' : 'var(--wc-text-tertiary)'}>
						{label}
					</Text>
					<Text fontSize="10px" color={selected ? 'var(--wc-text-secondary)' : 'var(--wc-text-muted)'}>
						{description}
					</Text>
				</VStack>
			</HStack>
		</Box>
	);
}

// ============================================================
// Checkbox-style toggle
// ============================================================

function ToggleCheck({
	checked,
	onChange,
	label,
	description,
	disabled,
}: {
	checked: boolean;
	onChange: (val: boolean) => void;
	label: string;
	description: string;
	disabled?: boolean;
}) {
	return (
		<HStack
			gap="3"
			px="3"
			py="2"
			borderRadius="lg"
			cursor={disabled ? 'not-allowed' : 'pointer'}
			opacity={disabled ? 0.35 : 1}
			onClick={() => { if (!disabled) onChange(!checked); }}
			_hover={disabled ? {} : { bg: 'var(--wc-bg-surface)' }}
			transition="background 0.15s ease"
		>
			<Box
				w="16px"
				h="16px"
				borderWidth="1.5px"
				borderColor={checked ? 'var(--wc-accent-purple)' : 'var(--wc-border-strong)'}
				borderRadius="sm"
				bg={checked ? 'var(--wc-accent-purple-bg-8)' : 'var(--wc-special-transparent)'}
				display="flex"
				alignItems="center"
				justifyContent="center"
				transition="all 0.15s ease"
				flexShrink={0}
			>
				{checked && <Check size={10} color="var(--wc-accent-purple)" />}
			</Box>
			<VStack gap="0" align="start">
				<Text fontSize="12px" fontWeight="500" color="var(--wc-text-secondary)">
					{label}
				</Text>
				<Text fontSize="10px" color="var(--wc-text-faint)">
					{description}
				</Text>
			</VStack>
		</HStack>
	);
}

// ============================================================
// Scope selector - "all" toggle or specific items
// ============================================================

function ScopeSelector({
	label,
	allLabel,
	value,
	onChange,
	pillPlaceholder,
	disabled,
}: {
	label: string;
	allLabel: string;
	value: true | string[];
	onChange: (val: true | string[]) => void;
	pillPlaceholder: string;
	disabled?: boolean;
}) {
	const isAll = value === true;

	return (
		<VStack gap="2" align="stretch">
			<HStack gap="2">
				<Text fontSize="11px" fontWeight="600" color="var(--wc-text-muted)" textTransform="uppercase" letterSpacing="0.05em">
					{label}
				</Text>
				<HStack gap="1" ml="auto">
					<Box
						px="2"
						py="0.5"
						borderRadius="md"
						fontSize="10px"
						fontWeight="600"
						cursor={disabled ? 'not-allowed' : 'pointer'}
						bg={isAll ? 'var(--wc-accent-blue-bg-12)' : 'var(--wc-special-transparent)'}
						color={isAll ? 'var(--wc-accent-blue-hover)' : 'var(--wc-text-faint)'}
						borderWidth="1px"
						borderColor={isAll ? 'var(--wc-accent-blue-border)' : 'var(--wc-border-subtle)'}
						onClick={() => { if (!disabled) onChange(true); }}
						transition="all 0.15s ease"
						opacity={disabled ? 0.4 : 1}
					>
						{allLabel}
					</Box>
					<Box
						px="2"
						py="0.5"
						borderRadius="md"
						fontSize="10px"
						fontWeight="600"
						cursor={disabled ? 'not-allowed' : 'pointer'}
						bg={!isAll ? 'var(--wc-accent-blue-bg-12)' : 'var(--wc-special-transparent)'}
						color={!isAll ? 'var(--wc-accent-blue-hover)' : 'var(--wc-text-faint)'}
						borderWidth="1px"
						borderColor={!isAll ? 'var(--wc-accent-blue-border)' : 'var(--wc-border-subtle)'}
						onClick={() => { if (!disabled) onChange([]); }}
						transition="all 0.15s ease"
						opacity={disabled ? 0.4 : 1}
					>
						Specific
					</Box>
				</HStack>
			</HStack>
			{!isAll && (
				<PillInput
					values={value as string[]}
					onChange={onChange}
					placeholder={pillPlaceholder}
					disabled={disabled}
				/>
			)}
		</VStack>
	);
}

// ============================================================
// Token created display - copy once warning
// ============================================================

function TokenCreatedDisplay({ rawToken }: { rawToken: string }) {
	const [copied, setCopied] = useState(false);

	const handleCopy = async () => {
		await navigator.clipboard.writeText(rawToken);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	return (
		<Box
			borderWidth="1px"
			borderColor="var(--wc-accent-yellow-border)"
			borderRadius="lg"
			bg="var(--wc-accent-yellow-bg-8)"
			p="3"
		>
			<VStack gap="2" align="stretch">
				<HStack gap="2">
					<AlertTriangle size={14} color="var(--wc-accent-yellow)" />
					<Text fontSize="12px" fontWeight="600" color="var(--wc-accent-yellow-strong)">
						Copy this token now — it will not be shown again
					</Text>
				</HStack>
				<HStack
					gap="2"
					bg="var(--wc-overlay-dim)"
					borderRadius="md"
					px="3"
					py="2"
				>
					<Text
						flex="1"
						fontSize="12px"
						fontFamily="mono"
						color="var(--wc-text-primary)"
						wordBreak="break-all"
						userSelect="all"
					>
						{rawToken}
					</Text>
					<IconButton
						aria-label="Copy token"
						size="xs"
						variant="ghost"
						color={copied ? 'var(--wc-accent-green-icon)' : 'var(--wc-text-tertiary)'}
						_hover={{ bg: 'var(--wc-bg-hover)' }}
						onClick={handleCopy}
					>
						{copied ? <Check size={14} /> : <Copy size={14} />}
					</IconButton>
				</HStack>
			</VStack>
		</Box>
	);
}

// ============================================================
// Main dialog
// ============================================================

interface ITokenDialogProps {
	open: boolean;
	onClose: () => void;
	editingToken: IAccessTokenInfo | null; // null = creating
}

export function TokenDialog({ open, onClose, editingToken }: ITokenDialogProps) {
	const isEditing = !!editingToken;
	const { toast } = useToast();

	// Form state
	const [name, setName] = useState(editingToken?.name ?? '');
	const [role, setRole] = useState<'admin' | 'inference'>(
		editingToken?.admin ? 'admin' : 'inference'
	);
	const [inference, setInference] = useState<true | string[]>(
		editingToken?.inference ?? true
	);
	const [mcpLabelledEnabled, setMcpLabelledEnabled] = useState(
		editingToken ? (editingToken.mcp_labelled === true || (Array.isArray(editingToken.mcp_labelled) && editingToken.mcp_labelled.length > 0)) : false
	);
	const [mcpLabelled, setMcpLabelled] = useState<true | string[]>(
		editingToken?.mcp_labelled ?? true
	);
	const [mcpInlineEnabled, setMcpInlineEnabled] = useState(
		editingToken ? (editingToken.mcp_inline === true || (Array.isArray(editingToken.mcp_inline) && editingToken.mcp_inline.length > 0)) : false
	);
	const [mcpInline, setMcpInline] = useState<true | string[]>(
		editingToken?.mcp_inline ?? true
	);

	// Created token (only shown after successful create)
	const [createdRawToken, setCreatedRawToken] = useState<string | null>(null);

	const createMutation = useMutation((data: IAccessTokenCreatePayload) => createToken(data));
	const updateMutation = useMutation((data: { id: string; payload: IAccessTokenUpdatePayload }) => updateToken(data.id, data.payload));

	const isAdmin = role === 'admin';

	const handleSave = async () => {
		if (!name.trim()) {
			toast('error', 'Token name is required');
			return;
		}

		if (isEditing) {
			const payload: IAccessTokenUpdatePayload = {
				name: name.trim(),
				admin: isAdmin,
				inference: isAdmin ? true : inference,
				mcp_labelled: isAdmin ? true : (mcpLabelledEnabled ? mcpLabelled : false as unknown as true | string[]),
				mcp_inline: isAdmin ? true : (mcpInlineEnabled ? mcpInline : false as unknown as true | string[]),
			};
			const result = await updateMutation.mutate({ id: editingToken.id, payload });
			if (result) {
				toast('success', 'Token updated');
				onClose();
			}
		} else {
			const payload: IAccessTokenCreatePayload = {
				name: name.trim(),
				admin: isAdmin,
				inference: isAdmin ? true : inference,
				mcp_labelled: isAdmin ? true : (mcpLabelledEnabled ? mcpLabelled : false as unknown as true | string[]),
				mcp_inline: isAdmin ? true : (mcpInlineEnabled ? mcpInline : false as unknown as true | string[]),
			};
			const result = await createMutation.mutate(payload);
			if (result) {
				setCreatedRawToken(result.token);
			}
		}
	};

	const loading = createMutation.loading || updateMutation.loading;

	return (
		<DialogRoot
			open={open}
			onOpenChange={(details) => { if (!details.open) onClose(); }}
			size="md"
		>
			<DialogContent
				bg="var(--wc-bg-dialog)"
				borderWidth="1px"
				borderColor="var(--wc-border-subtle)"
				borderRadius="xl"
				boxShadow="0 25px 50px rgba(0,0,0,0.5)"
			>
				<DialogHeader pb="2">
					<DialogTitle fontSize="15px" fontWeight="600" color="var(--wc-text-heading)">
						{createdRawToken ? 'Token Created' : (isEditing ? 'Edit Token' : 'Create Access Token')}
					</DialogTitle>
					<DialogCloseTrigger />
				</DialogHeader>

				<DialogBody>
					{createdRawToken ? (
						// Token created - show copy-once display
						<VStack gap="3" align="stretch">
							<TokenCreatedDisplay rawToken={createdRawToken} />
							<Text fontSize="11px" color="var(--wc-text-faint)">
								Use this token in the Authorization header: Bearer {createdRawToken.substring(0, 11)}...
							</Text>
						</VStack>
					) : (
						// Create/Edit form
						<VStack gap="4" align="stretch">
							{/* Token name */}
							<VStack gap="1.5" align="stretch">
<Text fontSize="11px" fontWeight="600" color="var(--wc-text-muted)" textTransform="uppercase" letterSpacing="0.05em">
					Name
								</Text>
								<Input
									value={name}
									onChange={(e) => setName(e.target.value)}
									placeholder="e.g. Mobile app, CI pipeline, Friend's access"
									size="sm"
bg="var(--wc-bg-interactive)"
								borderColor="var(--wc-border-default)"
								color="var(--wc-text-primary)"
								fontSize="12px"
								_placeholder={{ color: 'var(--wc-text-placeholder)' }}
								_focus={{ borderColor: 'var(--wc-accent-blue-focus)' }}
								/>
							</VStack>

							{/* Role selector */}
							<VStack gap="1.5" align="stretch">
<Text fontSize="11px" fontWeight="600" color="var(--wc-text-muted)" textTransform="uppercase" letterSpacing="0.05em">
					Access Level
								</Text>
								<HStack gap="2">
									<RoleOption
										selected={isAdmin}
										onClick={() => setRole('admin')}
										icon={<Shield size={16} />}
										label="Admin"
										description="Full control API, inference, and MCP access"
										color="var(--wc-accent-red)"
									/>
									<RoleOption
										selected={!isAdmin}
										onClick={() => setRole('inference')}
										icon={<Cpu size={16} />}
										label="Inference"
description="Query models through the proxy server"
										color="var(--wc-accent-blue-hover)"
									/>
								</HStack>
							</VStack>

							{/* Inference scope - only shown if not admin */}
							{!isAdmin && (
								<ScopeSelector
									label="Server Access"
									allLabel="All Servers"
									value={inference}
									onChange={setInference}
									pillPlaceholder="Type alias or server ID, press Enter"
									disabled={isAdmin}
								/>
							)}

							{/* MCP toggles - only shown if not admin */}
							{!isAdmin && (
								<VStack gap="2" align="stretch">
									<ToggleCheck
										checked={mcpLabelledEnabled}
										onChange={setMcpLabelledEnabled}
										label="MCP Tools (Labelled)"
										description="Allow calling MCP tools from mcp.json"
										disabled={isAdmin}
									/>
									{mcpLabelledEnabled && (
										<Box pl="7">
											<ScopeSelector
												label="Tool Access (Labelled)"
												allLabel="All Tools"
												value={mcpLabelled}
												onChange={setMcpLabelled}
												pillPlaceholder="Type tool name, press Enter"
												disabled={isAdmin}
											/>
										</Box>
									)}
									<ToggleCheck
										checked={mcpInlineEnabled}
										onChange={setMcpInlineEnabled}
										label="MCP Tools (Inline)"
										description="Allow calling ephemeral MCP tools"
										disabled={isAdmin}
									/>
									{mcpInlineEnabled && (
										<Box pl="7">
											<ScopeSelector
												label="Tool Access (Inline)"
												allLabel="All Tools"
												value={mcpInline}
												onChange={setMcpInline}
												pillPlaceholder="Type tool name, press Enter"
												disabled={isAdmin}
											/>
										</Box>
									)}
								</VStack>
							)}
						</VStack>
					)}
				</DialogBody>

				<DialogFooter pt="2">
					{createdRawToken ? (
						<Button
							size="sm"
							onClick={onClose}
							bg="var(--wc-accent-blue-bg-12)"
color="var(--wc-accent-blue-hover)"
							_hover={{ bg: 'var(--wc-accent-blue-focus)' }}
							fontSize="12px"
						>
							Done
						</Button>
					) : (
						<HStack gap="2">
							<Button
								size="sm"
								variant="ghost"
								onClick={onClose}
								color="var(--wc-text-tertiary)"
								_hover={{ bg: 'var(--wc-bg-card)' }}
								fontSize="12px"
							>
								Cancel
							</Button>
							<Button
								size="sm"
								onClick={handleSave}
								disabled={loading || !name.trim()}
								bg={isAdmin ? 'var(--wc-accent-red-bg-8)' : 'var(--wc-accent-blue-bg-12)'}
								color={isAdmin ? 'var(--wc-accent-red)' : 'var(--wc-accent-blue-hover)'}
								_hover={{ bg: isAdmin ? 'var(--wc-accent-red-hover)' : 'var(--wc-accent-blue-focus)' }}
								fontSize="12px"
							>
								{loading ? 'Saving...' : (isEditing ? 'Update Token' : 'Create Token')}
							</Button>
						</HStack>
					)}
				</DialogFooter>
			</DialogContent>
		</DialogRoot>
	);
}
