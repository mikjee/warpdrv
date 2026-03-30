import { useMemo } from 'react';
import { useStore } from '../store';
import type { ISummaryData } from '../api/summary-services';
import { EServerStatus } from '@warpcore/shared';

export function useSummary() {
	const servers = useStore((s) => s.servers);
	const proxyStatus = useStore((s) => s.proxyStatus);
	const devices = useStore((s) => s.devices);

	const summary = useMemo<ISummaryData>(() => {
		const running = Object.values(servers).filter(
			(s) => s.status === EServerStatus.RUNNING
		).length;
		const errors = Object.values(servers).filter(
			(s) => s.error != null && s.error.length > 0
		).length;

		return {
			servers: { running, errors },
			router: {
				online: proxyStatus?.running ?? false,
				hasError: proxyStatus?.error != null,
			},
			devices: { unique: devices.length },
		};
	}, [servers, proxyStatus, devices]);

	return { data: summary };
}