import { Text } from '@chakra-ui/react';
import React from 'react';

export const TileValueDisplay = React.memo(({ label, value }: { label: string; value: string | number }) => (
	<>
		<span style={{ color: "var(--w-home-tiles-label)", fontSize: "12px" }}>{label}</span>
		<Text fontSize="24px" fontWeight="600" color="var(--w-home-tiles-value)">
			{value}
		</Text>
	</>
));
