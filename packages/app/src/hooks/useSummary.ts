import { useMemo } from 'react';
import { useStore } from '../store';
import type { ISummaryData } from '../api/summary-services';
import { EServerStatus, EDownloadStatus } from '@warpcore/shared';
import { EMcpServerStatus } from '@warpcore/bridge';

export function useSummary() {
	const servers = useStore((s) => s.servers);
	const proxyStatus = useStore((s) => s.proxyStatus);
	const devices = useStore((s) => s.devices);
	const downloads = useStore((s) => s.downloads);
	const mcpServers = useStore((s) => s.mcpServers);

	const summary = useMemo<ISummaryData>(() => {
		const running = Object.values(servers).filter(
			(s) => s.status === EServerStatus.RUNNING
		).length;
		const errors = Object.values(servers).filter(
			(s) => s.error != null && s.error.length > 0
		).length;

		const downloadList = Object.values(downloads);
		const active = downloadList.filter(d =>
			d.status === EDownloadStatus.DOWNLOADING || d.status === EDownloadStatus.PAUSED
		).length;
		const completed = downloadList.filter(d => d.status === EDownloadStatus.COMPLETED).length;

		const mcpList = Object.values(mcpServers);
		const mcpTotal = mcpList.length;
		const mcpConnected = mcpList.filter(s => s.status === EMcpServerStatus.CONNECTED).length;
		const mcpConnecting = mcpList.filter(s => s.status === EMcpServerStatus.CONNECTING).length;
		const mcpError = mcpList.filter(s => s.status === EMcpServerStatus.ERROR).length;

		return {
			servers: { running, errors },
			router: {
				online: proxyStatus?.running ?? false,
				hasError: proxyStatus?.error != null,
			},
			devices: { unique: devices.length },
			downloads: { active, completed },
			mcp: { total: mcpTotal, connected: mcpConnected, connecting: mcpConnecting, error: mcpError },
		};
	}, [servers, proxyStatus, devices, downloads, mcpServers]);

	return { data: summary };
}