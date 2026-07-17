import { persistence } from '../index';
export async function getProjectRoot(threadId: string): Promise<string | null> {
	const ts = await persistence.getThreadState(threadId);
	if (ts?.projectRoot) return ts.projectRoot as string;
	const thread = await persistence.getThread(threadId);
	if (thread?.folderId) {
		const ws = await persistence.getWorkspaceState(thread.folderId);
		if (ws?.projectRoot) return ws.projectRoot as string;
	}
	return null;
}
