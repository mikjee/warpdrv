import { useState } from "react";
import { FolderInput } from "lucide-react";
import { useToast } from "@/components/ToastProvider";

type SlashCmdDirectoryPickerProps = {
	value: string;
	placeholder: string;
	inputRef: (el: HTMLElement | null) => void;
	onChange: (next: string) => void;
	onKeyDown: (e: React.KeyboardEvent) => void;
	onFocus: () => void;
	onBlur: (e: React.FocusEvent) => void;
};

export const SlashCmdDirectoryPicker: React.FC<SlashCmdDirectoryPickerProps> = ({
	value,
	placeholder,
	onChange,
}) => {
	const { toast } = useToast();
	const [isHovered, setIsHovered] = useState(false);

	const handleBrowse = async () => {
		if (typeof window !== "undefined" && (window as any).__TAURI_INTERNALS__) {
			try {
				const mod = await import("@tauri-apps/plugin-dialog");
				const path = await mod.open({ directory: true, multiple: false });
				if (path && typeof path === "string") onChange(path);
			} catch (err) {
				console.error("[SlashCmdDirectoryPicker] Failed to open directory picker:", err);
			}
		} else if (typeof window !== "undefined" && "showDirectoryPicker" in window) {
			try {
				const handle = await (window as any).showDirectoryPicker();
				if (handle) onChange(handle.name);
			} catch (err: any) {
				if (err.name !== "AbortError") console.error("[SlashCmdDirectoryPicker] Failed:", err);
			}
		} else {
			toast("error", "Directory picker not supported in this browser. Type the path manually.");
		}
	};

	return (
		<span
			onMouseEnter={() => setIsHovered(true)}
			onMouseLeave={() => setIsHovered(false)}
			style={{
				display: "inline-flex",
				alignItems: "center",
				gap: "3px",
				margin: "0 2px",
				borderRadius: "4px",
				padding: "0 4px",
				cursor: "pointer",
				minWidth: "8ch",
				maxWidth: "14ch",
				background: isHovered ? "var(--wc-bg-hover, rgba(255,255,255,0.06))" : "transparent",
			}}
		>
			<span style={{
				overflow: "hidden",
				textOverflow: "ellipsis",
				whiteSpace: "nowrap",
				color: value ? "var(--wc-text-secondary)" : "var(--wc-text-faint)",
			}}>
				{value || placeholder}
			</span>
			<span
				onMouseDown={(e) => {
					e.preventDefault();
					handleBrowse();
				}}
				style={{
					flexShrink: 0,
					cursor: "pointer",
					opacity: 0.5,
				}}
			>
				<FolderInput size={12} />
			</span>
		</span>
	);
};
