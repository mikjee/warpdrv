import { useState, useRef, useCallback } from 'react';
import {
	Box, Text, HStack, VStack, Flex, Badge, Input, IconButton,
	DialogRoot, DialogContent, DialogHeader, DialogBody, DialogFooter,
	DialogTitle, DialogCloseTrigger,
	Button,
} from '@chakra-ui/react';
import { X, Copy, Check, Shield, Cpu, Wrench, AlertTriangle } from 'lucide-react';
import type { IAccessTokenInfo, IAccessTokenCreatePayload, IAccessTokenUpdatePayload } from '@warpcore/shared';
import { useMutation } from '../hooks/useQuery';
import { createToken, updateToken } from '../api/services';
import { useToast } from './ToastProvider';

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
			borderColor={disabled ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.08)'}
			borderRadius="lg"
			bg={disabled ? 'rgba(0,0,0,0.1)' : 'rgba(0,0,0,0.2)'}
			px="2"
			py="1.5"
			minH="38px"
			cursor={disabled ? 'not-allowed' : 'text'}
			opacity={disabled ? 0.4 : 1}
			onClick={() => { if (!disabled) inputRef.current?.focus(); }}
			transition="border-color 0.15s ease"
			_focusWithin={{ borderColor: 'rgba(59, 130, 246, 0.4)' }}
		>
			<HStack gap="1.5" flexWrap="wrap">
				{values.map((val, idx) => (
					<Badge
						key={val}
						px="2"
						py="0.5"
						borderRadius="md"
						bg="rgba(59, 130, 246, 0.12)"
						color="#60a5fa"
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
									color="rgba(96,165,250,0.5)"
									_hover={{ color: '#f87171' }}
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
						color="rgba(255,255,255,0.7)"
						_placeholder={{ color: 'rgba(255,255,255,0.2)' }}
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
			borderColor={selected ? `${color}40` : 'rgba(255,255,255,0.06)'}
			borderRadius="lg"
			bg={selected ? `${color}08` : 'transparent'}
			cursor="pointer"
			onClick={onClick}
			transition="all 0.15s ease"
			_hover={{ borderColor: selected ? `${color}40` : 'rgba(255,255,255,0.12)' }}
		>
			<HStack gap="2.5">
				<Box color={selected ? color : 'rgba(255,255,255,0.3)'}>
					{icon}
				</Box>
				<VStack gap="0" align="start">
					<Text fontSize="12px" fontWeight="600" color={selected ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.5)'}>
						{label}
					</Text>
					<Text fontSize="10px" color={selected ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.25)'}>
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
			_hover={disabled ? {} : { bg: 'rgba(255,255,255,0.02)' }}
			transition="background 0.15s ease"
		>
			<Box
				w="16px"
				h="16px"
				borderWidth="1.5px"
				borderColor={checked ? '#a78bfa' : 'rgba(255,255,255,0.15)'}
				borderRadius="sm"
				bg={checked ? 'rgba(168, 85, 247, 0.2)' : 'transparent'}
				display="flex"
				alignItems="center"
				justifyContent="center"
				transition="all 0.15s ease"
				flexShrink={0}
			>
				{checked && <Check size={10} color="#a78bfa" />}
			</Box>
			<VStack gap="0" align="start">
				<Text fontSize="12px" fontWeight="500" color="rgba(255,255,255,0.7)">
					{label}
				</Text>
				<Text fontSize="10px" color="rgba(255,255,255,0.3)">
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
				<Text fontSize="11px" fontWeight="600" color="rgba(255,255,255,0.4)" textTransform="uppercase" letterSpacing="0.05em">
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
						bg={isAll ? 'rgba(59, 130, 246, 0.15)' : 'transparent'}
						color={isAll ? '#60a5fa' : 'rgba(255,255,255,0.3)'}
						borderWidth="1px"
						borderColor={isAll ? 'rgba(59, 130, 246, 0.3)' : 'rgba(255,255,255,0.06)'}
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
						bg={!isAll ? 'rgba(59, 130, 246, 0.15)' : 'transparent'}
						color={!isAll ? '#60a5fa' : 'rgba(255,255,255,0.3)'}
						borderWidth="1px"
						borderColor={!isAll ? 'rgba(59, 130, 246, 0.3)' : 'rgba(255,255,255,0.06)'}
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
			borderColor="rgba(234, 179, 8, 0.25)"
			borderRadius="lg"
			bg="rgba(234, 179, 8, 0.05)"
			p="3"
		>
			<VStack gap="2" align="stretch">
				<HStack gap="2">
					<AlertTriangle size={14} color="#eab308" />
					<Text fontSize="12px" fontWeight="600" color="#eab308">
						Copy this token now — it will not be shown again
					</Text>
				</HStack>
				<HStack
					gap="2"
					bg="rgba(0,0,0,0.3)"
					borderRadius="md"
					px="3"
					py="2"
				>
					<Text
						flex="1"
						fontSize="12px"
						fontFamily="mono"
						color="rgba(255,255,255,0.8)"
						wordBreak="break-all"
						userSelect="all"
					>
						{rawToken}
					</Text>
					<IconButton
						aria-label="Copy token"
						size="xs"
						variant="ghost"
						color={copied ? '#22c55e' : 'rgba(255,255,255,0.5)'}
						_hover={{ bg: 'rgba(255,255,255,0.06)' }}
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
				bg="#1a1a1a"
				borderWidth="1px"
				borderColor="rgba(255,255,255,0.06)"
				borderRadius="xl"
				boxShadow="0 25px 50px rgba(0,0,0,0.5)"
			>
				<DialogHeader pb="2">
					<DialogTitle fontSize="15px" fontWeight="600" color="rgba(255,255,255,0.9)">
						{createdRawToken ? 'Token Created' : (isEditing ? 'Edit Token' : 'Create Access Token')}
					</DialogTitle>
					<DialogCloseTrigger />
				</DialogHeader>

				<DialogBody>
					{createdRawToken ? (
						// Token created - show copy-once display
						<VStack gap="3" align="stretch">
							<TokenCreatedDisplay rawToken={createdRawToken} />
							<Text fontSize="11px" color="rgba(255,255,255,0.3)">
								Use this token in the Authorization header: Bearer {createdRawToken.substring(0, 11)}...
							</Text>
						</VStack>
					) : (
						// Create/Edit form
						<VStack gap="4" align="stretch">
							{/* Token name */}
							<VStack gap="1.5" align="stretch">
								<Text fontSize="11px" fontWeight="600" color="rgba(255,255,255,0.4)" textTransform="uppercase" letterSpacing="0.05em">
									Name
								</Text>
								<Input
									value={name}
									onChange={(e) => setName(e.target.value)}
									placeholder="e.g. Mobile app, CI pipeline, Friend's access"
									size="sm"
									bg="rgba(0,0,0,0.2)"
									borderColor="rgba(255,255,255,0.08)"
									color="rgba(255,255,255,0.8)"
									fontSize="12px"
									_placeholder={{ color: 'rgba(255,255,255,0.2)' }}
									_focus={{ borderColor: 'rgba(59, 130, 246, 0.4)' }}
								/>
							</VStack>

							{/* Role selector */}
							<VStack gap="1.5" align="stretch">
								<Text fontSize="11px" fontWeight="600" color="rgba(255,255,255,0.4)" textTransform="uppercase" letterSpacing="0.05em">
									Access Level
								</Text>
								<HStack gap="2">
									<RoleOption
										selected={isAdmin}
										onClick={() => setRole('admin')}
										icon={<Shield size={16} />}
										label="Admin"
										description="Full control API, inference, and MCP access"
										color="#f87171"
									/>
									<RoleOption
										selected={!isAdmin}
										onClick={() => setRole('inference')}
										icon={<Cpu size={16} />}
										label="Inference"
										description="Query models through the proxy server"
										color="#60a5fa"
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
							bg="rgba(59, 130, 246, 0.15)"
							color="#60a5fa"
							_hover={{ bg: 'rgba(59, 130, 246, 0.25)' }}
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
								color="rgba(255,255,255,0.5)"
								_hover={{ bg: 'rgba(255,255,255,0.04)' }}
								fontSize="12px"
							>
								Cancel
							</Button>
							<Button
								size="sm"
								onClick={handleSave}
								disabled={loading || !name.trim()}
								bg={isAdmin ? 'rgba(239, 68, 68, 0.15)' : 'rgba(59, 130, 246, 0.15)'}
								color={isAdmin ? '#f87171' : '#60a5fa'}
								_hover={{ bg: isAdmin ? 'rgba(239, 68, 68, 0.25)' : 'rgba(59, 130, 246, 0.25)' }}
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
