import { Plug } from 'lucide-react';
import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/store';
import { EMcpServerStatus } from '@warpcore/bridge';
import { TileContainer } from '../TileContainer';
import { TileValueDisplay } from '../TileValueDisplay';

export const McpTile = React.memo(() => {
	const navigate = useNavigate();
	const mcpServers = useStore((s) => s.mcpServers);

	const mcpConnected = useMemo(
		() => Object.values(mcpServers).filter((s) => s.status === EMcpServerStatus.CONNECTED).length,
		[mcpServers],
	);
	const mcpTotal = Object.values(mcpServers).length;
	const mcpError = useMemo(
		() => Object.values(mcpServers).filter((s) => s.status === EMcpServerStatus.ERROR).length,
		[mcpServers],
	);

	const state: 'online' | 'loading' | 'error' | 'offline' =
		mcpError > 0 ? 'error' : mcpTotal > 0 && mcpConnected === mcpTotal ? 'online' : 'offline';

	return (
		<TileContainer
			icon={<Plug size={18} />}
			label="MCP"
			statusDot={state}
			onClick={() => navigate('/mcp')}
		>
			<TileValueDisplay label="MCP Servers Connected" value={`${mcpConnected}/${mcpTotal}`} />
		</TileContainer>
	);
});
