import { Download } from 'lucide-react';
import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/store';
import { EDownloadStatus } from '@warpcore/shared';
import { TileContainer } from '../TileContainer';

export const DownloadsTile = React.memo(() => {
	const navigate = useNavigate();
	const downloads = useStore((s) => s.downloads);

	const { ongoing, total, completedBytes, totalBytes, percentage } = useMemo(() => {
		const all = Object.values(downloads);
		const ongoingCount = all.filter(
			(d) => d.status === EDownloadStatus.DOWNLOADING || d.status === EDownloadStatus.INSTALLING,
		).length;
		const completedBytesSum = all
			.filter((d) => d.status === EDownloadStatus.COMPLETED)
			.reduce((sum, d) => sum + d.fileSizeBytes, 0);
		const totalBytesSum = all.reduce((sum, d) => sum + d.fileSizeBytes, 0);
		const pct = totalBytesSum > 0 ? Math.round((completedBytesSum / totalBytesSum) * 100) : 0;

		return {
			ongoing: ongoingCount,
			total: all.length,
			completedBytes: completedBytesSum,
			totalBytes: totalBytesSum,
			percentage: pct,
		};
	}, [downloads]);

	const state: 'online' | 'loading' | 'offline' =
		total === 0
			? 'offline'
			: ongoing > 0
				? 'loading'
				: 'online';

	return (
		<TileContainer
			icon={<Download size={18} />}
			label="Downloads"
			statusDot={state}
			onClick={() => navigate('/hub')}
		>
			{total === 0 ? (
				<span style={{ color: 'var(--wc-text-faint)', fontSize: '12px' }}>—</span>
			) : (
				<>
					<span style={{ color: 'var(--wc-special-mono-gray)', fontSize: '12px' }}>
						{ongoing} / {total}
					</span>
					<span style={{ fontSize: '24px', fontWeight: '600', color: 'var(--wc-text-primary)' }}>
						{percentage}%
					</span>
				</>
			)}
		</TileContainer>
	);
});
