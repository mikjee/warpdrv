import { Box, Button, Flex, HStack, Input, Text, VStack } from "@chakra-ui/react";
import type { ILaunchParams } from "@warpcore/shared";
import { ELoadMode } from "@warpcore/shared";
import { FileInput } from "lucide-react";
import React, { useCallback } from "react";
import { Card } from "@/components/Card";
import { useToast } from "@/components/ToastProvider";
import { NumberField, SelectField, ToggleChip } from "./Helpers";

export const OptionsCard = React.memo(
	({
		params,
		onParamChange,
		buildNumber,
	}: {
		params: ILaunchParams;
		onParamChange: (
			key: keyof ILaunchParams,
			value: ILaunchParams[keyof ILaunchParams],
		) => void;
		buildNumber: number;
	}) => {
		const { toast } = useToast();
		const usesLoadMode = buildNumber >= 10105;
		const loadModeValue = params.loadMode ?? ELoadMode.AUTO;
		const loadModeOptions = [
			ELoadMode.AUTO,
			ELoadMode.NONE,
			ELoadMode.MMAP,
			ELoadMode.MLOCK,
			ELoadMode.MMAP_MLOCK,
			ELoadMode.DIO,
		];
		const loadModeLabels: Record<string, string> = {
			[ELoadMode.AUTO]: "Auto (default)",
			[ELoadMode.NONE]: "None",
			[ELoadMode.MMAP]: "MMap",
			[ELoadMode.MLOCK]: "MLock",
			[ELoadMode.MMAP_MLOCK]: "MMap + MLock",
			[ELoadMode.DIO]: "Direct I/O",
		};
		const handleBrowseChatTemplateFile = useCallback(async () => {
			if (typeof window !== "undefined" && (window as any).__TAURI_INTERNALS__) {
				try {
					const mod = await import("@tauri-apps/plugin-dialog");
					const result = await mod.open({
						directory: false,
						multiple: false,
						filters: [
							{ name: "Jinja files", extensions: ["jinja"] },
							{ name: "All files", extensions: ["*"] },
						],
					});
					if (result) onParamChange("chatTemplateFile", result);
				} catch (err) {
					console.error("[OptionsCard] Failed to open chat template file picker:", err);
				}
			} else {
				toast(
					"error",
					"File picker not supported in this browser. Please type the path manually.",
				);
			}
		}, [onParamChange, toast]);
		return (
			<Card>
				<VStack align="stretch" gap="3">
					<Text
						fontSize="11px"
						color="var(--wc-text-tertiary)"
						textTransform="uppercase"
						letterSpacing="0.05em"
					>
						Options
					</Text>
					<HStack gap="2" flexWrap="wrap">
						<ToggleChip
							label="Flash Attention"
							active={params.flashAttn}
							onClick={() => onParamChange("flashAttn", !params.flashAttn)}
						/>
						{!usesLoadMode && (
							<>
								<ToggleChip
									label="MLock"
									active={params.mlock}
									onClick={() => onParamChange("mlock", !params.mlock)}
								/>
								<ToggleChip
									label="MMap"
									active={params.mmap}
									onClick={() => onParamChange("mmap", !params.mmap)}
								/>
								<ToggleChip
									label="Direct I/O"
									active={params.directIo}
									onClick={() => onParamChange("directIo", !params.directIo)}
								/>
							</>
						)}
						<ToggleChip
							label="No Warmup"
							active={params.noWarmup}
							onClick={() => onParamChange("noWarmup", !params.noWarmup)}
						/>
						<ToggleChip
							label="Jinja"
							active={params.jinja}
							onClick={() => onParamChange("jinja", !params.jinja)}
						/>
						<ToggleChip
							label="SWA Full"
							active={params.swaFull}
							onClick={() => onParamChange("swaFull", !params.swaFull)}
						/>
						<ToggleChip
							label="Preserve Thinking"
							active={params.preserveThinking ?? false}
							onClick={() =>
								onParamChange(
									"preserveThinking",
									!(params.preserveThinking ?? false),
								)
							}
						/>
						<ToggleChip
							label="KV Unified"
							active={params.kvUnified ?? false}
							onClick={() => onParamChange("kvUnified", !(params.kvUnified ?? false))}
						/>
					</HStack>
					{usesLoadMode && (
						<Flex>
							<SelectField
								label="Load Mode"
								value={loadModeValue}
								options={loadModeOptions}
								optionLabels={loadModeLabels}
								onChange={(v) => onParamChange("loadMode", v as ELoadMode)}
							/>
						</Flex>
					)}
					<Flex gap="4">
						<NumberField
							label="Batch Size"
							value={params.batchSize}
							onChange={(v) => onParamChange("batchSize", v)}
							min={1}
							step={256}
						/>
						<NumberField
							label="Micro Batch"
							value={params.ubatchSize}
							onChange={(v) => onParamChange("ubatchSize", v)}
							min={1}
							step={64}
						/>
					</Flex>
					<Flex gap="4">
						<NumberField
							label="Threads"
							value={params.threads}
							onChange={(v) => onParamChange("threads", v)}
							min={0}
							suffix="0 = auto"
						/>
						<NumberField
							label="Threads (Batch)"
							value={params.threadsBatch}
							onChange={(v) => onParamChange("threadsBatch", v)}
							min={0}
							suffix="0 = auto"
						/>
					</Flex>
					<Box>
						<Text
							fontSize="11px"
							color="var(--wc-text-tertiary)"
							textTransform="uppercase"
							letterSpacing="0.05em"
							mb="1.5"
						>
							Chat Template
						</Text>
						<HStack gap="2" mb="2">
							<Button
								size="sm"
								variant="outline"
								flex="1"
								justifyContent="center"
								borderColor={
									params.chatTemplateMode === "inline"
										? "var(--wc-accent-blue-border)"
										: "var(--wc-border-subtle)"
								}
								borderWidth={params.chatTemplateMode === "inline" ? "2px" : "1px"}
								color={
									params.chatTemplateMode === "inline"
										? "var(--wc-accent-blue)"
										: "var(--wc-text-secondary)"
								}
								bg={
									params.chatTemplateMode === "inline"
										? "var(--wc-accent-blue-bg-8)"
										: "var(--wc-bg-subtle)"
								}
								_hover={{
									borderColor:
										params.chatTemplateMode === "inline"
											? "var(--wc-accent-blue)"
											: "var(--wc-border-hover)",
								}}
								onClick={() => onParamChange("chatTemplateMode", "inline")}
							>
								<Text fontSize="12px" fontWeight="500">
									Inline
								</Text>
							</Button>
							<Button
								size="sm"
								variant="outline"
								flex="1"
								justifyContent="center"
								borderColor={
									params.chatTemplateMode === "file"
										? "var(--wc-accent-blue-border)"
										: "var(--wc-border-subtle)"
								}
								borderWidth={params.chatTemplateMode === "file" ? "2px" : "1px"}
								color={
									params.chatTemplateMode === "file"
										? "var(--wc-accent-blue)"
										: "var(--wc-text-secondary)"
								}
								bg={
									params.chatTemplateMode === "file"
										? "var(--wc-accent-blue-bg-8)"
										: "var(--wc-bg-subtle)"
								}
								_hover={{
									borderColor:
										params.chatTemplateMode === "file"
											? "var(--wc-accent-blue)"
											: "var(--wc-border-hover)",
								}}
								onClick={() => onParamChange("chatTemplateMode", "file")}
							>
								<Text fontSize="12px" fontWeight="500">
									File
								</Text>
							</Button>
						</HStack>
						{params.chatTemplateMode === "file" ? (
							<HStack gap="2">
								<Input
									placeholder="/path/to/chat_template.jinja"
									size="sm"
									bg="var(--wc-bg-subtle)"
									borderColor="var(--wc-border-default)"
									color="var(--wc-text-primary)"
									fontFamily='"Geist Mono", monospace'
									fontSize="12px"
									borderRadius="lg"
									_placeholder={{ color: "var(--wc-text-faint)" }}
									_focus={{
										borderColor: "var(--wc-accent-blue)",
										outline: "none",
									}}
									value={params.chatTemplateFile}
									onChange={(e) =>
										onParamChange("chatTemplateFile", e.target.value)
									}
									flex="1"
								/>
								<Button
									size="sm"
									variant="ghost"
									color="var(--wc-text-muted)"
									_hover={{
										color: "var(--wc-accent-blue)",
										bg: "var(--wc-accent-blue-bg-8)",
									}}
									borderRadius="lg"
									minW="8"
									px="0"
									onClick={handleBrowseChatTemplateFile}
									title="Browse chat template file"
								>
									<FileInput size={14} />
								</Button>
							</HStack>
						) : (
							<Input
								placeholder="Auto-detect"
								size="sm"
								bg="var(--wc-bg-subtle)"
								borderColor="var(--wc-border-default)"
								color="var(--wc-text-primary)"
								fontSize="12px"
								borderRadius="lg"
								_placeholder={{ color: "var(--wc-text-faint)" }}
								_focus={{ borderColor: "var(--wc-accent-blue)", outline: "none" }}
								value={params.chatTemplate}
								onChange={(e) => onParamChange("chatTemplate", e.target.value)}
							/>
						)}
					</Box>
					<Box>
						<Text
							fontSize="11px"
							color="var(--wc-text-tertiary)"
							textTransform="uppercase"
							letterSpacing="0.05em"
							mb="1.5"
						>
							Custom Flags
						</Text>
						<Input
							placeholder="--some-flag value"
							size="sm"
							bg="var(--wc-bg-subtle)"
							borderColor="var(--wc-border-default)"
							color="var(--wc-text-primary)"
							fontFamily='"Geist Mono", monospace'
							fontSize="12px"
							borderRadius="lg"
							_placeholder={{ color: "var(--wc-text-faint)" }}
							_focus={{ borderColor: "var(--wc-accent-blue)", outline: "none" }}
							value={params.extraArgs}
							onChange={(e) => onParamChange("extraArgs", e.target.value)}
						/>
					</Box>
				</VStack>
			</Card>
		);
	},
);
