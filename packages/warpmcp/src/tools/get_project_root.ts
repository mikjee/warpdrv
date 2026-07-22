import type { IWarpmcpDeps } from '../types';

export const getProjectRootDefinition = {
	name: 'get_project_root',
	description: 'Return the projectRoot for the current thread, if set.',
	inputSchema: {
		type: 'object',
		properties: {},
		required: [],
	},
	resultLimit: 40960,
};

export async function getProjectRootHandler(
	deps: IWarpmcpDeps,
	args: { threadId?: string },
): Promise<{ projectRoot: string | null }> {
	if (!args.threadId) {
		throw new Error('threadId is required.');
	}
	const projectRoot = await deps.getProjectRoot?.(args.threadId);
	return { projectRoot: projectRoot ?? null };
}
