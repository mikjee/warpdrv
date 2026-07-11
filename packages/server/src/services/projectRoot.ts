import { persistence } from '../index';
export async function getProjectRoot(threadId: string): Promise<string | null> {
	const s = await persistence.getThreadState(threadId);
	return (s?.projectRoot as string) || null;
}
