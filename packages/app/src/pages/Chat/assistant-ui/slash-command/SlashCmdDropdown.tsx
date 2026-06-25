import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { computePosition, flip, shift, offset } from "@floating-ui/dom";

export type TDropdownItem = { label: string; value: string };

type SlashCmdDropdownProps = {
	value: string;
	placeholder: string;
	inputRef: (el: HTMLInputElement | null) => void;
	onChange: (next: string) => void;
	onKeyDown: (e: React.KeyboardEvent) => void;
	onFocus: () => void;
	onBlur: (e: React.FocusEvent) => void;
	items?: TDropdownItem[] | (() => TDropdownItem[]);
};

function useResolveItems(items: unknown): TDropdownItem[] {
	if (typeof items === "function") {
		return (items as () => TDropdownItem[])();
	}
	if (Array.isArray(items)) return items;
	return [];
}

export const SlashCmdDropdown: React.FC<SlashCmdDropdownProps> = ({
	value,
	placeholder,
	inputRef,
	onChange,
	onKeyDown,
	onFocus,
	onBlur,
	items,
}) => {
	const resolvedItems = useResolveItems(items);
	const [isOpen, setIsOpen] = useState(false);
	const [highlight, setHighlight] = useState(0);
	const inputRefLocal = useRef<HTMLInputElement | null>(null);
	const dropdownRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		inputRef(inputRefLocal.current);
	}, [inputRef]);

	const displayLabel = (() => {
		if (!value) return "";
		const found = resolvedItems.find((it) => it.value === value);
		return found ? found.label : value;
	})();

	const filtered = (() => {
		const query = displayLabel.toLowerCase();
		if (!query) return resolvedItems;
		return resolvedItems.filter(
			(it) =>
				it.label.toLowerCase().includes(query) ||
				it.value.toLowerCase().includes(query),
		);
	})();

	const toggleOpen = () => {
		const next = !isOpen;
		setIsOpen(next);
		if (next) {
			onFocus();
			setHighlight(0);
		} else {
			onBlur({} as React.FocusEvent);
		}
	};

	const handleSelect = (item: TDropdownItem) => {
		onChange(item.value);
		setIsOpen(false);
		onBlur({} as React.FocusEvent);
		inputRefLocal.current?.blur();
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Tab") {
			onKeyDown(e);
			return;
		}
		if (isOpen) {
			if (e.key === "ArrowDown") {
				e.preventDefault();
				setHighlight((h) => (h + 1) % filtered.length);
				return;
			}
			if (e.key === "ArrowUp") {
				e.preventDefault();
				setHighlight((h) => (h - 1 + filtered.length) % filtered.length);
				return;
			}
			if (e.key === "Enter" && filtered.length > 0) {
				e.preventDefault();
				handleSelect(filtered[highlight]);
				return;
			}
			if (e.key === "Escape") {
				e.preventDefault();
				setIsOpen(false);
				onBlur({} as React.FocusEvent);
				return;
			}
		} else {
			if (e.key === "ArrowDown" || e.key === "Enter") {
				e.preventDefault();
				setIsOpen(true);
				onFocus();
				setHighlight(0);
				return;
			}
		}
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
			if (!dropdownRef.current || !inputRefLocal.current) return;
			if (
				dropdownRef.current.contains(e.target as Node) ||
				inputRefLocal.current.contains(e.target as Node)
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
		setHighlight(0);
	}, [displayLabel, isOpen, resolvedItems]);

	useEffect(() => {
		if (!isOpen || !inputRefLocal.current || !dropdownRef.current) return;
		computePosition(inputRefLocal.current, dropdownRef.current, {
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
				contentEditable={false}
				style={{
					display: "inline-flex",
					alignItems: "center",
					position: "relative",
				}}
			>
				<input
					ref={inputRefLocal}
					type="text"
					value={displayLabel}
					placeholder={placeholder}
					onChange={(e) => onChange(e.target.value)}
					onKeyDown={handleKeyDown}
					onFocus={() => {
						if (!isOpen) {
							setIsOpen(true);
							onFocus();
							setHighlight(0);
						}
					}}
					onBlur={() => {
						setIsOpen(false);
						onBlur({} as React.FocusEvent);
					}}
					style={{
						background: "var(--wc-bg-subtle, rgba(255,255,255,0.06))",
						border: "none",
						borderRadius: "4px",
						color: "var(--wc-text-secondary)",
						font: "inherit",
						padding: "0 4px",
						margin: "0 2px",
						width: `${Math.max(placeholder.length, displayLabel.length, 4)}ch`,
						minWidth: "8ch",
						outline: "none",
						cursor: "text",
					}}
				/>
			</span>

			{isOpen &&
				createPortal(
					<div
						ref={dropdownRef}
						style={{
							position: "absolute",
							zIndex: 10000,
							minWidth: "140px",
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
						{filtered.length === 0 && (
							<div
								style={{
									padding: "8px 12px",
									fontSize: "0.75rem",
									color: "var(--wc-text-faint)",
								}}
							>
								No matches
							</div>
						)}
						{filtered.map((item, i) => (
							<div
								key={item.value}
								onMouseDown={(e) => { e.preventDefault(); handleSelect(item); }}
								onKeyDown={(e) => {
									if (e.key === "Enter") handleSelect(item);
								}}
								tabIndex={0}
								style={{
									display: "flex",
									alignItems: "center",
									justifyContent: "space-between",
									padding: "6px 8px",
									borderRadius: "6px",
									cursor: "pointer",
									fontSize: "0.75rem",
									color: "var(--wc-text-primary)",
									background:
										i === highlight
											? "var(--wc-bg-selected)"
											: "transparent",
								}}
								onMouseEnter={() => setHighlight(i)}
							>
								<span
									style={{
										overflow: "hidden",
										textOverflow: "ellipsis",
										whiteSpace: "nowrap",
									}}
								>
									{item.label}
								</span>
								{value === item.value && (
									<span style={{ color: "var(--wc-accent-green)" }}>✓</span>
								)}
							</div>
						))}
					</div>,
					document.body,
				)}
		</>
	);
};
