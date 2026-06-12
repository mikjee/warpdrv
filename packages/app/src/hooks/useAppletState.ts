import { useEffect, useRef } from 'react';
import { EventNode, AppletManager, EAppletHostType, EAppletScope } from '@warpcore/realmcore';
import { feApplets } from '@/applets';

export function useAppletState(node: EventNode, currentThreadId: string | null) {
	const managerRef = useRef<AppletManager>();

	if (!managerRef.current) {
		managerRef.current = new AppletManager(
			node,
			EAppletScope.THREAD,
			undefined,
			EAppletHostType.FE,
			feApplets,
		);
	}

	useEffect(() => {
		if (currentThreadId) {
			managerRef.current!.updateScopeValue(currentThreadId);
		}
		return () => {
			managerRef.current!.terminateAll();
		};
	}, [currentThreadId]);
}
