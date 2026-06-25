import type { FC } from "react";

type SlashCmdDefaultInputProps = {
	value: string;
	placeholder: string;
	inputRef: (el: HTMLInputElement | null) => void;
	onChange: (next: string) => void;
	onKeyDown: (e: React.KeyboardEvent) => void;
	onFocus: () => void;
	onBlur: (e: React.FocusEvent) => void;
};

export const SlashCmdDefaultInput: FC<SlashCmdDefaultInputProps> = ({
	value,
	placeholder,
	inputRef,
	onChange,
	onKeyDown,
	onFocus,
	onBlur,
}) => (
	<input
		type="text"
		ref={inputRef}
		value={value}
		placeholder={placeholder}
		onChange={(e) => onChange(e.target.value)}
		onKeyDown={onKeyDown}
		onFocus={onFocus}
		onBlur={onBlur}
		style={{
			background: "var(--wc-bg-subtle, rgba(255,255,255,0.06))",
			border: "none",
			borderRadius: "4px",
			color: "var(--wc-text-secondary)",
			font: "inherit",
			padding: "0 4px",
			margin: "0 2px",
			width: `${Math.max(placeholder.length, value.length, 4)}ch`,
			minWidth: "8ch",
			outline: "none",
		}}
	/>
);
