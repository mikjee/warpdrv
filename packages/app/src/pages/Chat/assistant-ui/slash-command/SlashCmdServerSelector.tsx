import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { computePosition, flip, shift, offset } from "@floating-ui/dom";
import { ChevronDown, Eye } from "lucide-react";
import { EServerStatus, IServer } from "@warpcore/shared";
import { useStore } from "@/store";

type SlashCmdServerSelectorProps = {
	value: string;
	placeholder: string;
	inputRef: (el: HTMLInputElement | null) => void;
	onChange: (next: string) => void;
	onKeyDown: (e: React.KeyboardEvent) => void;
	onFocus: () => void;
	onBlur: (e: React.FocusEvent) => void;
};

function ServerDot({ status }: { status: EServerStatus }) {
	const color =
		status === EServerStatus.RUNNING
			? "var(--wc-accent-green-icon)"
			: status === EServerStatus.LOADING
				? "var(--wc-accent-yellow-strong)"
				: status === EServerStatus.ERROR
					? "var(--wc-accent-red)"
					: "var(--wc-text-disabled)";

	return (
		<span
			style={{
				display: "inline-block",
				width: "8px",
				height: "8px",
				borderRadius: "50%",
				background: color,
				flexShrink: 0,
			}}
		/>
	);
}

export const SlashCmdServerSelector: React.FC<SlashCmdServerSelectorProps> = ({
	value,
	inputRef,
	onChange,
	onKeyDown,
	onFocus,
	onBlur,
}) => {
	const serversMap = useStore((s) => s.servers);
	const [isOpen, setIsOpen] = useState(false);
	const triggerRef = useRef<HTMLSpanElement | null>(null);
	const dropdownRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		inputRef(triggerRef.current);
	}, [inputRef]);

	const servers = useMemo(
		() =>
			Object.values(serversMap).sort((a, b) => {
				const aRunning = a.status === EServerStatus.RUNNING ? 1 : 0;
				const bRunning = b.status === EServerStatus.RUNNING ? 1 : 0;
				return bRunning - aRunning;
			}),
		[serversMap],
	);

	const selectedServer = useMemo(
		() => (value ? (serversMap[value] as IServer | undefined) : undefined),
		[value, serversMap],
	);

	const handleSelect = (serverId: string) => {
		onChange(serverId);
		setIsOpen(false);
		onBlur({} as React.FocusEvent);
	};

	const handleTriggerMouseDown = (e: React.MouseEvent) => {
		if (isOpen) {
			e.preventDefault();
			return;
		}
	};

	const handleTriggerFocus = () => {
		if (!isOpen) {
			setIsOpen(true);
			onFocus();
		}
	};

	const handleTriggerBlur = (e: React.FocusEvent) => {
		const relatedTarget = e.relatedTarget as Node | null;
		if (dropdownRef.current && relatedTarget && dropdownRef.current.contains(relatedTarget)) {
			return;
		}
		if (isOpen) {
			setIsOpen(false);
		}
		onBlur(e);
	};

	useEffect(() => {
		if (!isOpen) return;

		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				setIsOpen(false);
				onBlur({} as React.FocusEvent);
			}
		};

		const handleClickOutside = (e: MouseEvent) => {
			if (!dropdownRef.current || !triggerRef.current) return;
			if (
				dropdownRef.current.contains(e.target as Node) ||
				triggerRef.current.contains(e.target as Node)
			)
				return;
			setIsOpen(false);
			onBlur({} as React.FocusEvent);
		};

		document.addEventListener("keydown", handleKeyDown);
		document.addEventListener("mousedown", handleClickOutside);
		return () => {
			document.removeEventListener("keydown", handleKeyDown);
			document.removeEventListener("mousedown", handleClickOutside);
		};
	}, [isOpen, onFocus, onBlur]);

	useEffect(() => {
		if (!isOpen || !triggerRef.current || !dropdownRef.current) return;

		computePosition(triggerRef.current, dropdownRef.current, {
			placement: "bottom-start",
			middleware: [offset(6), flip(), shift({ padding: 8 })],
		}).then(({ x, y }) => {
			if (!dropdownRef.current) return;
			dropdownRef.current.style.left = `${x}px`;
			dropdownRef.current.style.top = `${y}px`;
		});
	}, [isOpen]);

	return (
		<>
	<span
			ref={triggerRef}
			contentEditable={false}
			tabIndex={0}
			onMouseDown={handleTriggerMouseDown}
			onClick={() => {
				if (!isOpen) {
					setIsOpen(true);
					onFocus();
				}
			}}
			onFocus={handleTriggerFocus}
			onBlur={handleTriggerBlur}
			onKeyDown={(e) => {
				onKeyDown(e);
			}}
				style={{
					display: "inline-flex",
					alignItems: "center",
					gap: "4px",
					cursor: "pointer",
					padding: "0 4px",
					margin: "0 2px",
					borderRadius: "4px",
					background: isOpen
						? "var(--wc-bg-hover, rgba(255,255,255,0.06))"
						: "transparent",
					minWidth: "8ch",
					maxWidth: "14ch",
				}}
			>
				{selectedServer ? (
					<>
						<ServerDot status={selectedServer.status} />
						<span
							style={{
								overflow: "hidden",
								textOverflow: "ellipsis",
								whiteSpace: "nowrap",
							}}
						>
							{selectedServer.serverName}
						</span>
						{selectedServer.useMultiModal && (
							<Eye size={12} color="var(--wc-special-vision-yellow)" />
						)}
					</>
				) : (
					<span style={{ color: "var(--wc-text-faint)" }}>Select server</span>
				)}
				<ChevronDown size={12} style={{ opacity: 0.4, flexShrink: 0 }} />
			</span>

			{isOpen &&
				createPortal(
					<div
						ref={dropdownRef}
						style={{
							position: "absolute",
							zIndex: 10000,
							minWidth: "160px",
							maxWidth: "220px",
							maxHeight: "200px",
							overflowY: "auto",
							borderRadius: "8px",
							border: "1px solid var(--wc-border-overlay)",
							background: "var(--wc-bg-elevated)",
							boxShadow: "0px 8px 24px rgba(0,0,0,0.25)",
							padding: "4px",
						}}
					>
						{servers.length === 0 && (
							<div
								style={{
									padding: "8px 12px",
									fontSize: "0.75rem",
									color: "var(--wc-text-faint)",
								}}
							>
								No servers
							</div>
						)}
						{servers.map((server) => (
							<div
								key={server.id}
								onMouseDown={(e) => e.stopPropagation()}
								onClick={() => handleSelect(server.id)}
								style={{
									display: "flex",
									alignItems: "center",
									gap: "8px",
									padding: "6px 8px",
									borderRadius: "6px",
									cursor: "pointer",
									fontSize: "0.75rem",
									color: "var(--wc-text-primary)",
									background:
										value === server.id
											? "var(--wc-bg-selected)"
											: "transparent",
								}}
								onMouseEnter={(e) => {
									if (value !== server.id) {
										(e.currentTarget as HTMLDivElement).style.background =
											"var(--wc-bg-card)";
									}
								}}
								onMouseLeave={(e) => {
									if (value !== server.id) {
										(e.currentTarget as HTMLDivElement).style.background =
											"transparent";
									}
								}}
							>
								<ServerDot status={server.status} />
								<span
									style={{
										flex: 1,
										overflow: "hidden",
										textOverflow: "ellipsis",
										whiteSpace: "nowrap",
									}}
								>
									{server.serverName}
								</span>
								{server.useMultiModal && (
									<Eye size={12} color="var(--wc-special-vision-yellow)" />
								)}
							</div>
						))}
					</div>,
					document.body,
				)}
		</>
	);
};
